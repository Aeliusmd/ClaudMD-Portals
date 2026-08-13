"""Read-only visit documents from dbo.DocterPublishes."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, time
from pathlib import Path
from threading import Lock
import re

from fastapi import HTTPException, status
from fastapi.responses import FileResponse, Response

from app.auth.dependencies import CurrentUser
from app.db.clinic import get_clinic_by_activation_key, get_clinic_connection
from app.employer.schemas import (
    EmployeeVisitDocument,
    EmployeeVisitRecord,
    EmployeeVisitsResponse,
)
from app.employer.visit_document_grouping import (
    build_grouped_visit_documents,
    normalize_publish_datetime,
    version_tag_from_path,
)
from app.employer.employee_search import _category_sql_clause
from app.employer.profile import fetch_profile_from_clinic

# pdfium is not safe for concurrent renders in-process (Windows heap crashes).
_PDF_RENDER_LOCK = Lock()


def get_employee_visits(
    current_user: CurrentUser,
    patient_id: int,
    *,
    from_date: date | None = None,
    to_date: date | None = None,
    category: str | None = None,
) -> EmployeeVisitsResponse:
    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )

    profile = fetch_profile_from_clinic(clinic, current_user)
    if profile.employer_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employer not found for this user.",
        )

    today = date.today()
    start = from_date or (today - timedelta(days=30))
    end = to_date or today
    if start > end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="From date must be on or before to date.",
        )

    visits = _fetch_visits_with_documents(
        clinic=clinic,
        employer_id=profile.employer_id,
        patient_id=int(patient_id),
        from_date=start,
        to_date=end,
        category=category,
    )
    upcoming = _fetch_upcoming_appointments_for_patient(
        clinic=clinic,
        employer_id=profile.employer_id,
        patient_id=int(patient_id),
        category=category,
    )
    visits = _merge_visit_records(visits, upcoming)

    return EmployeeVisitsResponse(
        patient_id=int(patient_id),
        employer_id=profile.employer_id,
        from_date=start.isoformat(),
        to_date=end.isoformat(),
        visits=visits,
    )


def open_employee_visit_document_file(
    current_user: CurrentUser,
    patient_id: int,
    document_id: int,
) -> FileResponse:
    """
    Stream a published visit PDF for the logged-in employer.
    DocterPublishes.Path is a folder; the PDF is resolved by report name.
    """
    pdf_path = _require_employee_publish_pdf(current_user, patient_id, document_id)
    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=pdf_path.name,
        content_disposition_type="inline",
    )


def open_employee_visit_document_thumbnail(
    current_user: CurrentUser,
    patient_id: int,
    document_id: int,
) -> Response:
    """PNG of page 1 for visit-document tiles (no client-side PDF.js)."""
    pdf_path = _require_employee_publish_pdf(current_user, patient_id, document_id)
    try:
        png_bytes = render_pdf_first_page_png(pdf_path)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document does not exist.",
        ) from exc
    return Response(content=png_bytes, media_type="image/png")


def _normalize_publish_folder(folder: str) -> str:
    """Normalize DB Path values like DoctorPublishRecord//1583\\V1."""
    normalized = (folder or "").replace("/", "\\").strip()
    if not normalized:
        return ""
    # Collapse doubled separators after the UNC/server prefix (\\server\...).
    while "\\\\" in normalized[2:]:
        head, tail = normalized[:2], normalized[2:]
        normalized = head + tail.replace("\\\\", "\\")
    return normalized


def _pdf_name_candidates(report_name: str) -> list[str]:
    candidates: list[str] = []
    name = (report_name or "").strip()
    if not name:
        return candidates
    candidates.append(name if name.lower().endswith(".pdf") else f"{name}.pdf")
    cleaned = "".join(ch for ch in name if ch.isalnum() or ch in {" ", "-", "_"})
    cleaned = " ".join(cleaned.split())
    if cleaned and cleaned.lower() != name.lower():
        candidates.append(f"{cleaned}.pdf")
    return candidates


def _find_pdf_in_folder(root: Path, report_name: str) -> Path | None:
    candidates = _pdf_name_candidates(report_name)
    if not candidates:
        return None
    try:
        if not root.exists() or not root.is_dir():
            return None
        for candidate in candidates:
            direct = root / candidate
            if direct.is_file():
                return direct
        wanted = {c.lower() for c in candidates}
        for entry in root.iterdir():
            if entry.is_file() and entry.suffix.lower() == ".pdf":
                if entry.name.lower() in wanted:
                    return entry
    except OSError:
        return None
    return None


def _version_folder_sort_key(path: Path) -> tuple[int, str]:
    match = re.search(r"^V(\d+)$", path.name, re.IGNORECASE)
    if match:
        return (int(match.group(1)), path.name.lower())
    return (0, path.name.lower())


def _resolve_publish_pdf_path(*, folder: str, report_name: str) -> Path | None:
    """
    Resolve a DocterPublishes folder/file to a PDF on disk.

    If the exact V-folder from Path is missing (common when DB has V2 but only
    V1 was copied to the share), fall back to sibling V* folders under the same
    check-in directory, preferring the highest available version.

    Never raises for missing/unreachable shares — returns None.
    """
    if not folder:
        return None

    normalized = _normalize_publish_folder(folder)
    if not normalized:
        return None
    root = Path(normalized)

    try:
        if root.is_file():
            return root if root.suffix.lower() == ".pdf" else None

        found = _find_pdf_in_folder(root, report_name)
        if found is not None:
            return found

        # Exact V-folder missing or empty — try sibling version folders.
        parent = root.parent if root.name.upper().startswith("V") else root
        if not parent.exists() or not parent.is_dir():
            return None

        version_dirs = [
            entry
            for entry in parent.iterdir()
            if entry.is_dir() and re.match(r"^V\d+$", entry.name, re.IGNORECASE)
        ]
        version_dirs.sort(key=_version_folder_sort_key, reverse=True)

        ordered: list[Path] = []
        if root not in version_dirs and root.name.upper().startswith("V"):
            ordered.append(root)
        ordered.extend(version_dirs)

        seen: set[str] = set()
        for candidate_dir in ordered:
            key = str(candidate_dir).lower()
            if key in seen:
                continue
            seen.add(key)
            found = _find_pdf_in_folder(candidate_dir, report_name)
            if found is not None:
                return found
    except OSError:
        return None

    return None


def _require_employee_publish_pdf(
    current_user: CurrentUser,
    patient_id: int,
    document_id: int,
) -> Path:
    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )

    profile = fetch_profile_from_clinic(clinic, current_user)
    if profile.employer_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employer not found for this user.",
        )

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                dp.Id,
                dp.CheckInId,
                dp.ReportId,
                dp.ReportName,
                dp.Name,
                dp.Path,
                ch.PatientId,
                ch.EmployerId
            FROM dbo.DocterPublishes dp
            INNER JOIN dbo.CheckInsHeader ch ON ch.Id = dp.CheckInId
            WHERE dp.Id = ?
              AND (dp.IsDeleted = 0 OR dp.IsDeleted IS NULL)
              AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
            """,
            (int(document_id),),
        )
        row = cursor.fetchone()

        sibling_rows: list[dict] = []
        if row is not None:
            report_id = row.ReportId
            check_in_id = row.CheckInId
            if report_id is not None and check_in_id is not None:
                cursor.execute(
                    """
                    SELECT dp.Id, dp.ReportName, dp.Name, dp.Path
                    FROM dbo.DocterPublishes dp
                    WHERE dp.CheckInId = ?
                      AND dp.ReportId = ?
                      AND (dp.IsDeleted = 0 OR dp.IsDeleted IS NULL)
                    ORDER BY dp.Id DESC
                    """,
                    (int(check_in_id), int(report_id)),
                )
                cols = [col[0] for col in cursor.description]
                sibling_rows = [dict(zip(cols, item)) for item in cursor.fetchall()]

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document does not exist.",
        )
    if int(row.PatientId) != int(patient_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document does not exist.",
        )
    if int(row.EmployerId) != int(profile.employer_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Document is not available for this employer.",
        )

    report_name = (row.ReportName or row.Name or "").strip()
    pdf_path = _resolve_publish_pdf_path(
        folder=(row.Path or "").strip(),
        report_name=report_name,
    )

    # If this publish's Path folder is empty/missing, try sibling publish Paths.
    if pdf_path is None:
        for sibling in sibling_rows:
            if int(sibling["Id"]) == int(document_id):
                continue
            sibling_name = (
                (sibling.get("ReportName") or sibling.get("Name") or report_name or "")
            ).strip()
            pdf_path = _resolve_publish_pdf_path(
                folder=(sibling.get("Path") or "").strip(),
                report_name=sibling_name,
            )
            if pdf_path is not None:
                break

    if pdf_path is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document does not exist.",
        )
    return pdf_path


def render_pdf_first_page_png(pdf_path: Path, *, scale: float = 1.25) -> bytes:
    """Rasterize page 1 of a PDF to PNG bytes."""
    from io import BytesIO

    import pypdfium2 as pdfium

    with _PDF_RENDER_LOCK:
        pdf = pdfium.PdfDocument(str(pdf_path))
        try:
            if len(pdf) < 1:
                raise ValueError("PDF has no pages.")
            page = pdf[0]
            try:
                pil_image = page.render(scale=scale).to_pil()
            finally:
                page.close()
            # Keep tiles light: shrink very large pages.
            max_edge = 900
            w, h = pil_image.size
            longest = max(w, h)
            if longest > max_edge:
                ratio = max_edge / float(longest)
                pil_image = pil_image.resize(
                    (max(1, int(w * ratio)), max(1, int(h * ratio)))
                )
            buffer = BytesIO()
            pil_image.save(buffer, format="PNG", optimize=True)
            return buffer.getvalue()
        finally:
            pdf.close()


def _row_to_employee_visit_document(row: dict) -> EmployeeVisitDocument | None:
    check_in_id = int(row["CheckInId"])
    report_name = (
        (row.get("ReportName") or "").strip()
        or (row.get("ReportTableName") or "").strip()
        or (row.get("ReportTitle") or "").strip()
        or (row.get("Name") or "").strip()
        or "Document"
    )
    folder = (row.get("Path") or "").strip()
    badge = _preview_badge(row.get("ReportId"), report_name)
    return EmployeeVisitDocument(
        id=int(row["Id"]),
        check_in_id=check_in_id,
        report_id=int(row["ReportId"]) if row.get("ReportId") is not None else None,
        report_name=report_name,
        name=(row.get("Name") or "").strip() or report_name,
        path=folder or None,
        preview_badge=badge,
        preview_label=badge,
        is_completed=bool(row.get("IsComplated")),
        published_at=normalize_publish_datetime(row.get("CreatedDateTime")),
        version_tag=version_tag_from_path(folder),
    )


def _fetch_visits_with_documents(
    *,
    clinic,
    employer_id: int,
    patient_id: int,
    from_date: date,
    to_date: date,
    category: str | None = None,
) -> list[EmployeeVisitRecord]:
    category_sql, _ = _category_sql_clause(category)
    visit_sql = f"""
        SELECT
            ch.Id AS CheckInId,
            ch.CheckInDate,
            vt.Description AS VisitTypeDescription,
            vt.Code AS VisitTypeCode,
            vt.CategoryId AS VisitCategoryId
        FROM dbo.CheckInsHeader ch
        LEFT JOIN dbo.VisitTypes vt ON vt.Id = ch.VisitTypeId
        WHERE ch.PatientId = ?
          AND ch.EmployerId = ?
          AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
          AND ch.CheckInDate IS NOT NULL
          AND ch.CheckInDate >= ?
          AND ch.CheckInDate <= ?
          {category_sql}
        ORDER BY ch.CheckInDate DESC, ch.Id DESC
    """

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(visit_sql, (patient_id, employer_id, from_date, to_date))
        columns = [col[0] for col in cursor.description]
        visit_rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

        if not visit_rows:
            return []

        check_in_ids = [int(row["CheckInId"]) for row in visit_rows]
        placeholders = ",".join("?" for _ in check_in_ids)
        docs_sql = f"""
            SELECT
                dp.Id,
                dp.CheckInId,
                dp.ReportId,
                dp.ReportName,
                dp.Name,
                dp.Path,
                dp.IsComplated,
                CONVERT(varchar(30), dp.CreatedDateTime, 126) AS CreatedDateTime,
                r.Name AS ReportTableName,
                r.ReportTitle,
                r.Code AS ReportCode
            FROM dbo.DocterPublishes dp
            LEFT JOIN dbo.Reports r ON r.Id = dp.ReportId
            WHERE dp.CheckInId IN ({placeholders})
              AND (dp.IsDeleted = 0 OR dp.IsDeleted IS NULL)
            ORDER BY dp.CheckInId DESC, dp.Id ASC
        """
        cursor.execute(docs_sql, tuple(check_in_ids))
        doc_columns = [col[0] for col in cursor.description]
        doc_rows = [dict(zip(doc_columns, row)) for row in cursor.fetchall()]

    docs_by_checkin: dict[int, list[EmployeeVisitDocument]] = {}
    rows_by_checkin: dict[int, list[dict]] = defaultdict(list)
    for row in doc_rows:
        rows_by_checkin[int(row["CheckInId"])].append(row)

    for check_in_id, rows in rows_by_checkin.items():
        docs_by_checkin[check_in_id] = build_grouped_visit_documents(
            rows,
            row_to_document=_row_to_employee_visit_document,
        )

    visits: list[EmployeeVisitRecord] = []
    for row in visit_rows:
        check_in_id = int(row["CheckInId"])
        category = _visit_category(row.get("VisitCategoryId"), row.get("VisitTypeCode"))
        label = (
            row.get("VisitTypeDescription")
            or row.get("VisitTypeCode")
            or category
            or "Visit"
        )
        visits.append(
            EmployeeVisitRecord(
                visit_id=f"checkin-{check_in_id}",
                check_in_id=check_in_id,
                check_in_date=_format_display_date(row.get("CheckInDate")),
                check_in_date_value=_format_date_iso(row.get("CheckInDate")),
                visit_label=label,
                category=category,
                documents=docs_by_checkin.get(check_in_id, []),
            )
        )
    return visits


def _fetch_upcoming_appointments_for_patient(
    *,
    clinic,
    employer_id: int,
    patient_id: int,
    category: str | None = None,
) -> list[EmployeeVisitRecord]:
    category_sql, _ = _category_sql_clause(category)
    sql = f"""
        SELECT
            s.Id AS ScheduleId,
            s.Date,
            s.StartTime,
            s.EndTime,
            s.Duration,
            s.Note,
            s.AppointmentStatusId,
            COALESCE(a.Id, s.AppointmentId) AS AppointmentId,
            a.VisitTypeId AS VisitTypeId,
            vt.Description AS VisitTypeDescription,
            vt.Code AS VisitTypeCode,
            vt.CategoryId AS VisitCategoryId,
            ar.Name AS ResourceName,
            loc.Name AS LocationName
        FROM dbo.AppointmentSchedules s
        LEFT JOIN dbo.Appointments a ON a.Id = s.AppointmentId
        LEFT JOIN dbo.VisitTypes vt ON vt.Id = a.VisitTypeId
        LEFT JOIN dbo.AppointmentResources ar ON ar.Id = s.ResourceId
        LEFT JOIN dbo.Locations loc ON loc.Id = s.LocationId
        WHERE (s.IsDeleted = 0 OR s.IsDeleted IS NULL)
          AND a.PatientId = ?
          AND a.EmployerId = ?
          AND s.Date IS NOT NULL
          AND s.StartTime IS NOT NULL
          AND (
                s.Date > CAST(GETDATE() AS date)
             OR (
                    s.Date = CAST(GETDATE() AS date)
                AND s.StartTime >= CAST(GETDATE() AS time)
                )
          )
          {category_sql}
        ORDER BY s.Date ASC, s.StartTime ASC
    """
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(sql, (patient_id, employer_id))
        columns = [col[0] for col in cursor.description]
        rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

    visits: list[EmployeeVisitRecord] = []
    for row in rows:
        schedule_id = int(row["ScheduleId"])
        category = _visit_category(row.get("VisitCategoryId"), row.get("VisitTypeCode"))
        label = (
            row.get("VisitTypeDescription")
            or row.get("VisitTypeCode")
            or category
            or "Appointment"
        )
        appointment_id = row.get("AppointmentId")
        duration = row.get("Duration")
        visits.append(
            EmployeeVisitRecord(
                visit_id=f"appt-{schedule_id}",
                is_upcoming=True,
                schedule_id=schedule_id,
                appointment_id=int(appointment_id) if appointment_id is not None else None,
                check_in_date=_format_display_date(row.get("Date")),
                check_in_date_value=_format_date_iso(row.get("Date")),
                visit_label=label,
                category=category,
                documents=[],
                time=_format_time_display(row.get("StartTime")),
                end_time=_format_time_display(row.get("EndTime")),
                provider=(row.get("ResourceName") or "").strip() or None,
                clinic=(row.get("LocationName") or "").strip() or None,
                status=_appointment_status_label(row.get("AppointmentStatusId")),
                duration_minutes=int(duration) if duration is not None else None,
                note=(row.get("Note") or "").strip() or None,
            )
        )
    return visits


def _merge_visit_records(
    check_in_visits: list[EmployeeVisitRecord],
    upcoming_visits: list[EmployeeVisitRecord],
) -> list[EmployeeVisitRecord]:
    # Completed check-ins first (newest first) so documents from DocterPublishes
    # are visible by default; upcoming appointments follow.
    check_ins = sorted(
        check_in_visits,
        key=lambda visit: (
            visit.check_in_date_value or "",
            visit.check_in_id or 0,
        ),
        reverse=True,
    )
    upcoming = sorted(
        upcoming_visits,
        key=lambda visit: (
            visit.check_in_date_value or "",
            visit.time or "",
        ),
    )
    return check_ins + upcoming


# dbo.Enums AppointmentStatus (EnumTypeId -> Value)
_APPOINTMENT_STATUS_LABELS: dict[int, str] = {
    1: "Pending",
    2: "Confirmed",
    3: "Arrived",
    4: "Check-In",
    5: "Seen",
    6: "Cancelled",
    7: "No Show",
    8: "Reschedule",
    9: "Check-Out",
}


def _appointment_status_label(status_id) -> str:
    if status_id is None:
        return "Pending"
    try:
        key = int(status_id)
    except (TypeError, ValueError):
        return "Pending"
    return _APPOINTMENT_STATUS_LABELS.get(key, "Pending")


def _format_time_display(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        value = value.time()
    if isinstance(value, time):
        return value.strftime("%I:%M %p").lstrip("0")
    return str(value)


def _preview_badge(report_id, report_name: str) -> str:
    rid = None
    try:
        if report_id is not None:
            rid = int(report_id)
    except (TypeError, ValueError):
        rid = None

    name = (report_name or "").strip().lower()
    if rid in {11, 16} or "first report" in name or name == "dfr":
        return "DFR"
    if rid == 14 or "work status" in name or "work-status" in name:
        return "WSR"
    if "therapy" in name or "pt report" in name or "physical" in name:
        return "PR"
    if "office visit" in name:
        return "OV"
    letters = "".join(ch for ch in (report_name or "") if ch.isalpha())
    if len(letters) >= 2:
        return letters[:3].upper()
    return "DOC"


def _visit_category(category_id, code) -> str | None:
    normalized = (code or "").strip().upper()
    if normalized == "PDS":
        return "Drug Screen"
    if category_id == 1:
        return "Injury"
    if category_id == 2:
        return "Physical"
    return None


def _format_date_iso(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _format_display_date(value) -> str | None:
    iso = _format_date_iso(value)
    if not iso:
        return None
    try:
        parsed = datetime.strptime(iso, "%Y-%m-%d")
        return parsed.strftime("%b %d, %Y")
    except ValueError:
        return iso
