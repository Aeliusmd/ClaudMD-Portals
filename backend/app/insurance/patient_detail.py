"""Read-only insurance patient detail: demographics + visits + documents."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

from fastapi import HTTPException, status
from fastapi.responses import FileResponse, Response

from app.auth.dependencies import CurrentUser
from app.db.clinic import get_clinic_by_activation_key, get_clinic_connection
from app.employer.visit_document_grouping import (
    build_grouped_visit_documents,
    normalize_publish_datetime,
    version_tag_from_path,
)
from app.employer.visit_documents import (
    _format_date_iso,
    _format_display_date,
    _preview_badge,
    _resolve_publish_pdf_path,
    _visit_category,
    render_pdf_first_page_png,
)
from app.insurance.profile import fetch_profile_from_clinic
from app.insurance.schemas import (
    InsurancePatientDetailResponse,
    InsurancePatientVisitDocument,
    InsurancePatientVisitRecord,
)

# How far back to load visit history on the detail page.
VISIT_LOOKBACK_DAYS = 365

COVERAGE_WORKERS_COMP = "workers_comp"
COVERAGE_PRIVATE = "private"


def _normalize_coverage(coverage: str | None) -> str | None:
    if coverage is None:
        return None
    key = coverage.strip().lower()
    if key in {"workers_comp", "workerscomp", "workers-comp", "wc"}:
        return COVERAGE_WORKERS_COMP
    if key in {"private", "private_insurance", "privateinsurance", "private-insurance"}:
        return COVERAGE_PRIVATE
    return None


def _employer_scope_sql(coverage: str | None) -> str:
    if coverage == COVERAGE_PRIVATE:
        return "AND ch.EmployerId IS NULL"
    if coverage == COVERAGE_WORKERS_COMP:
        return "AND ch.EmployerId IS NOT NULL"
    return ""


def get_patient_detail(
    current_user: CurrentUser,
    patient_id: int,
    *,
    from_date: date | None = None,
    to_date: date | None = None,
    coverage: str | None = None,
) -> InsurancePatientDetailResponse:
    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )

    profile = fetch_profile_from_clinic(clinic, current_user)
    if profile.insurance_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Insurance company not found for this user.",
        )

    today = date.today()
    start = from_date or (today - timedelta(days=VISIT_LOOKBACK_DAYS))
    end = to_date or today
    if start > end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="From date must be on or before to date.",
        )

    coverage_key = _normalize_coverage(coverage)

    detail = _fetch_patient_header(
        clinic=clinic,
        insurance_id=profile.insurance_id,
        patient_id=int(patient_id),
        coverage=coverage_key,
    )
    visits = _fetch_visits_with_documents(
        clinic=clinic,
        insurance_id=profile.insurance_id,
        patient_id=int(patient_id),
        from_date=start,
        to_date=end,
        coverage=coverage_key,
    )

    return InsurancePatientDetailResponse(
        **detail,
        from_date=start.isoformat(),
        to_date=end.isoformat(),
        visits=visits,
    )


def _fetch_patient_header(
    *, clinic, insurance_id: int, patient_id: int, coverage: str | None
) -> dict:
    """
    Latest check-in for this patient under the logged-in insurer.
    Optional coverage scopes Workers Comp (employer set) vs Private (employer null).
    """
    employer_scope = _employer_scope_sql(coverage)
    sql = f"""
        SELECT TOP 1
            p.Id AS PatientId,
            p.AccountNumber,
            p.FirstName,
            p.LastName,
            p.DateOfBirth,
            p.GenderId,
            p.CellPhone,
            p.HomePhone,
            p.WorkPhone,
            p.Email,
            p.Address1,
            p.Address2,
            p.City,
            p.State,
            p.ZipCode,
            ch.Id AS CheckInId,
            ch.EmployerId,
            ch.IncidentId,
            inc.IncidentNumber,
            emp.Name AS EmployerName,
            ins.Name AS InsuranceName
        FROM dbo.CheckInsHeader ch
        INNER JOIN dbo.Patients p ON p.Id = ch.PatientId
        LEFT JOIN dbo.Employers emp ON emp.Id = ch.EmployerId
        LEFT JOIN dbo.Insurances ins ON ins.Id = ch.InsuranceId
        LEFT JOIN dbo.Incidents inc ON inc.Id = ch.IncidentId
        WHERE ch.PatientId = ?
          AND ch.InsuranceId = ?
          {employer_scope}
          AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
          AND (p.IsDeleted = 0 OR p.IsDeleted IS NULL)
          AND ch.CheckInDate IS NOT NULL
        ORDER BY ch.CheckInDate DESC, ch.Id DESC
    """
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(sql, (int(patient_id), int(insurance_id)))
        columns = [col[0] for col in cursor.description]
        row = cursor.fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Patient not found for this insurance company.",
            )
        data = dict(zip(columns, row))

    first = (data.get("FirstName") or "").strip()
    last = (data.get("LastName") or "").strip()
    full_name = " ".join(part for part in [first, last] if part).strip() or "Unknown"

    account_no = data.get("AccountNumber")
    account_str = str(account_no) if account_no is not None else None

    phone = (
        (data.get("CellPhone") or "").strip()
        or (data.get("HomePhone") or "").strip()
        or (data.get("WorkPhone") or "").strip()
        or None
    )

    street_lines = [
        line
        for line in [
            (data.get("Address1") or "").strip(),
            (data.get("Address2") or "").strip(),
        ]
        if line
    ]
    city_line = ", ".join(
        part
        for part in [
            (data.get("City") or "").strip(),
            " ".join(
                p
                for p in [
                    (data.get("State") or "").strip(),
                    (data.get("ZipCode") or "").strip(),
                ]
                if p
            ).strip(),
        ]
        if part
    )
    address_lines = street_lines + ([city_line] if city_line else [])

    if coverage == COVERAGE_PRIVATE:
        is_workers_comp = False
    elif coverage == COVERAGE_WORKERS_COMP:
        is_workers_comp = True
    else:
        is_workers_comp = data.get("EmployerId") is not None

    coverage_label = "Workers Comp" if is_workers_comp else "Private Insurance"
    employer_name = (
        None
        if not is_workers_comp
        else ((data.get("EmployerName") or "").strip() or None)
    )

    incident_number = data.get("IncidentNumber")
    return {
        "patient_id": int(data["PatientId"]),
        "check_in_id": int(data["CheckInId"]),
        "coverage": coverage_label,
        "patient_name": full_name,
        "display_patient_id": f"P-{int(data['PatientId'])}",
        "account_no": account_str,
        "date_of_birth": _format_dob_slash(data.get("DateOfBirth")),
        "gender": _gender_short(data.get("GenderId")),
        "phone": phone,
        "email": (data.get("Email") or "").strip() or None,
        "address_lines": address_lines,
        "employer_name": employer_name,
        "insurance_company": (data.get("InsuranceName") or "").strip() or None,
        "incident_id": int(data["IncidentId"]) if data.get("IncidentId") is not None else None,
        "incident_number": str(incident_number) if incident_number is not None else None,
        "insurance_id": int(insurance_id),
    }


def _row_to_insurance_visit_document(row: dict) -> InsurancePatientVisitDocument | None:
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
    return InsurancePatientVisitDocument(
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
    insurance_id: int,
    patient_id: int,
    from_date: date,
    to_date: date,
    coverage: str | None = None,
) -> list[InsurancePatientVisitRecord]:
    employer_scope = _employer_scope_sql(coverage)
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
          AND ch.InsuranceId = ?
          {employer_scope}
          AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
          AND ch.CheckInDate IS NOT NULL
          AND ch.CheckInDate >= ?
          AND ch.CheckInDate <= ?
        ORDER BY ch.CheckInDate DESC, ch.Id DESC
    """

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            visit_sql, (int(patient_id), int(insurance_id), from_date, to_date)
        )
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

    docs_by_checkin: dict[int, list[InsurancePatientVisitDocument]] = {}
    rows_by_checkin: dict[int, list[dict]] = defaultdict(list)
    for row in doc_rows:
        rows_by_checkin[int(row["CheckInId"])].append(row)

    for check_in_id, rows in rows_by_checkin.items():
        docs_by_checkin[check_in_id] = build_grouped_visit_documents(
            rows,
            row_to_document=_row_to_insurance_visit_document,
        )

    visits: list[InsurancePatientVisitRecord] = []
    for row in visit_rows:
        check_in_id = int(row["CheckInId"])
        category = _visit_category(row.get("VisitCategoryId"), row.get("VisitTypeCode"))
        # Workers Comp must display Injury (not private Personal Injury).
        if coverage == COVERAGE_WORKERS_COMP and category == "Personal Injury":
            category = "Injury"
        label = (
            row.get("VisitTypeDescription")
            or row.get("VisitTypeCode")
            or category
            or "Visit"
        )
        visits.append(
            InsurancePatientVisitRecord(
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


def open_insurance_visit_document_file(
    current_user: CurrentUser,
    patient_id: int,
    document_id: int,
) -> FileResponse:
    """
    Stream a published visit PDF for the logged-in insurance user.
    Same share-resolution as employer portal; scoped by InsuranceId.
    """
    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )

    profile = fetch_profile_from_clinic(clinic, current_user)
    if profile.insurance_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Insurance company not found for this user.",
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
                ch.InsuranceId
            FROM dbo.DocterPublishes dp
            INNER JOIN dbo.CheckInsHeader ch ON ch.Id = dp.CheckInId
            WHERE dp.Id = ?
              AND (dp.IsDeleted = 0 OR dp.IsDeleted IS NULL)
              AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
            """,
            (int(document_id),),
        )
        row = cursor.fetchone()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )
    if int(row.PatientId) != int(patient_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found for this patient.",
        )
    if row.InsuranceId is None or int(row.InsuranceId) != int(profile.insurance_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Document is not available for this insurance company.",
        )

    pdf_path = _resolve_publish_pdf_path(
        folder=(row.Path or "").strip(),
        report_name=(row.ReportName or row.Name or "").strip(),
    )
    if pdf_path is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document file is not available on the publish share.",
        )

    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=pdf_path.name,
        content_disposition_type="inline",
    )


def open_insurance_visit_document_thumbnail(
    current_user: CurrentUser,
    patient_id: int,
    document_id: int,
) -> Response:
    """PNG of page 1 for insurance visit document tiles."""
    # Reuse auth + path resolution from the file stream helper.
    file_response = open_insurance_visit_document_file(
        current_user, patient_id, document_id
    )
    try:
        png_bytes = render_pdf_first_page_png(Path(file_response.path))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document preview is not available.",
        ) from exc
    return Response(content=png_bytes, media_type="image/png")


def _format_dob_slash(value) -> str | None:
    iso = _format_date_iso(value)
    if not iso:
        return None
    try:
        parsed = datetime.strptime(iso, "%Y-%m-%d")
        return f"{parsed.month}/{parsed.day}/{parsed.year}"
    except ValueError:
        return iso


def _gender_short(gender_id) -> str | None:
    if gender_id is None:
        return None
    try:
        gid = int(gender_id)
    except (TypeError, ValueError):
        return None
    if gid == 1:
        return "M"
    if gid == 2:
        return "F"
    return None
