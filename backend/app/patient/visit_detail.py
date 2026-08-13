"""Read-only patient visit detail: demographics, visit, docs, other visits."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from pathlib import Path

from fastapi import HTTPException, status
from fastapi.responses import FileResponse, Response

from app.auth.dependencies import CurrentUser
from app.db.clinic import get_clinic_by_activation_key, get_clinic_connection
from app.employer.shift_type import shift_type_label
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
    render_pdf_first_page_png,
)
from app.patient.profile import fetch_profile_from_clinic
from app.patient.schemas import (
    PatientVisitDetailResponse,
    PatientVisitDocument,
    PatientVisitOtherRow,
    PatientVisitPatientInfo,
)

VISIT_LOOKBACK_DAYS = 365

_CHECKIN_STATUS_LABELS: dict[int, str] = {
    1: "Completed",
    2: "In Progress",
    3: "Cancelled",
    4: "No Show",
    5: "Checked In",
}


def get_visit_detail(
    current_user: CurrentUser,
    check_in_id: int,
) -> PatientVisitDetailResponse:
    clinic = _require_clinic(current_user)
    profile = fetch_profile_from_clinic(clinic, current_user)
    if profile.patient_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient record not found for this account.",
        )
    patient_id = int(profile.patient_id)

    header = _fetch_visit_header(
        clinic=clinic,
        patient_id=patient_id,
        check_in_id=int(check_in_id),
    )
    if not header:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Visit not found for this patient.",
        )

    documents = _fetch_documents_for_checkin(clinic, int(check_in_id))
    other_visits = _fetch_other_visits(
        clinic=clinic,
        patient_id=patient_id,
        exclude_check_in_id=int(check_in_id),
    )

    category = _visit_category(
        header.get("VisitCategoryId"),
        header.get("VisitTypeCode"),
    ) or "Other"

    return PatientVisitDetailResponse(
        id=str(check_in_id),
        check_in_id=int(check_in_id),
        patient_id=patient_id,
        category=category,
        provider=_provider_name(header),
        location=_location_name(header),
        date=_format_display_date(header.get("CheckInDate")),
        date_value=_format_date_iso(header.get("CheckInDate")),
        status=_status_label(header),
        work_status=_work_status_label(header),
        restrictions=_restrictions_text(header),
        follow_up=_format_display_date(header.get("NextWorkShiftFromDate")),
        special_instructions=_special_instructions(header),
        visit_type=(
            (header.get("VisitTypeDescription") or "").strip()
            or (header.get("VisitTypeCode") or "").strip()
            or None
        ),
        show_employer=category not in {"Urgent Care", "Personal Injury"},
        show_insurance=category not in {"Physical"},
        show_work_status=category not in {
            "Urgent Care",
            "Personal Injury",
            "Physical",
        },
        patient=_map_patient_info(header, patient_id),
        documents=documents,
        other_visits=other_visits,
    )


def open_visit_document_file(
    current_user: CurrentUser,
    check_in_id: int,
    document_id: int,
) -> FileResponse:
    pdf_path = _require_patient_publish_pdf(
        current_user, int(check_in_id), int(document_id)
    )
    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=pdf_path.name,
        content_disposition_type="inline",
    )


def open_visit_document_thumbnail(
    current_user: CurrentUser,
    check_in_id: int,
    document_id: int,
) -> Response:
    pdf_path = _require_patient_publish_pdf(
        current_user, int(check_in_id), int(document_id)
    )
    try:
        png_bytes = render_pdf_first_page_png(pdf_path)
    except Exception as exc:  # noqa: BLE001 — surface as 404 for missing/unreadable PDF
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document does not exist.",
        ) from exc
    return Response(content=png_bytes, media_type="image/png")


def _require_clinic(current_user: CurrentUser):
    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )
    return clinic


def _require_patient_publish_pdf(
    current_user: CurrentUser,
    check_in_id: int,
    document_id: int,
) -> Path:
    clinic = _require_clinic(current_user)
    profile = fetch_profile_from_clinic(clinic, current_user)
    if profile.patient_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient record not found for this account.",
        )

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                dp.Id,
                dp.CheckInId,
                dp.ReportName,
                dp.Name,
                dp.Path,
                r.Name AS ReportTableName,
                r.ReportTitle
            FROM dbo.DocterPublishes dp
            INNER JOIN dbo.CheckInsHeader ch ON ch.Id = dp.CheckInId
            LEFT JOIN dbo.Reports r ON r.Id = dp.ReportId
            WHERE dp.Id = ?
              AND dp.CheckInId = ?
              AND ch.PatientId = ?
              AND (dp.IsDeleted = 0 OR dp.IsDeleted IS NULL)
              AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
            """,
            (int(document_id), int(check_in_id), int(profile.patient_id)),
        )
        row = cursor.fetchone()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document does not exist.",
        )

    report_name = (
        (row.ReportName or "").strip()
        or (row.ReportTableName or "").strip()
        or (row.ReportTitle or "").strip()
        or (row.Name or "").strip()
        or "Document"
    )
    folder = (row.Path or "").strip()
    pdf_path = _resolve_publish_pdf_path(folder=folder, report_name=report_name)
    if pdf_path is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document does not exist.",
        )
    return pdf_path


def _fetch_visit_header(*, clinic, patient_id: int, check_in_id: int) -> dict | None:
    sql = """
        SELECT
            ch.Id AS CheckInId,
            ch.PatientId,
            ch.CheckInDate,
            ch.CheckOutDate,
            ch.CheckInStatusId,
            ch.SpecialInstructions AS HeaderSpecialInstructions,
            ch.CheckInInstructions,
            ch.CheckInNotes,
            ch.WorkStatusId,
            vt.Description AS VisitTypeDescription,
            vt.Code AS VisitTypeCode,
            vt.CategoryId AS VisitCategoryId,
            COALESCE(
                NULLIF(LTRIM(RTRIM(prov.Name)), ''),
                NULLIF(
                    LTRIM(RTRIM(ISNULL(prov.FirstName, '') + ' ' + ISNULL(prov.LastName, ''))),
                    ''
                ),
                NULLIF(LTRIM(RTRIM(ar.Name)), ''),
                '—'
            ) AS ProviderName,
            COALESCE(NULLIF(LTRIM(RTRIM(loc.Name)), ''), '—') AS LocationName,
            p.FirstName,
            p.LastName,
            p.AccountNumber,
            p.GenderId,
            p.DateOfBirth,
            p.Email AS PatientEmail,
            p.CellPhone,
            p.HomePhone,
            p.WorkPhone,
            p.Address1,
            p.Address2,
            p.City,
            p.State,
            p.ZipCode,
            e.Name AS EmployerName,
            i.Name AS InsuranceName,
            ews.CurrentWorkShiftTypeId,
            ews.CurrentWorkShiftFromDate,
            ews.CurrentWorkShiftToDate,
            ews.NextWorkShiftTypeId,
            ews.NextWorkShiftFromDate,
            ews.SpecialInstructions AS WorkStatusSpecialInstructions,
            er.Summary AS RestrictionSummary,
            er.Other AS RestrictionOther,
            er.Dictate AS RestrictionDictate
        FROM dbo.CheckInsHeader ch
        INNER JOIN dbo.Patients p ON p.Id = ch.PatientId
        LEFT JOIN dbo.VisitTypes vt ON vt.Id = ch.VisitTypeId
        LEFT JOIN dbo.Providers prov ON prov.Id = ch.ProviderId
        LEFT JOIN dbo.Locations loc ON loc.Id = ch.LocationId
        LEFT JOIN dbo.AppointmentResources ar ON ar.Id = ch.ResourceId
        LEFT JOIN dbo.Employers e ON e.Id = ch.EmployerId
        LEFT JOIN dbo.Insurances i ON i.Id = ch.InsuranceId
        OUTER APPLY (
            SELECT TOP 1
                ws.CurrentWorkShiftTypeId,
                ws.CurrentWorkShiftFromDate,
                ws.CurrentWorkShiftToDate,
                ws.NextWorkShiftTypeId,
                ws.NextWorkShiftFromDate,
                ws.SpecialInstructions
            FROM dbo.EHRWorkStatuses ws
            WHERE ws.CheckInId = ch.Id
              AND (ws.IsDeleted = 0 OR ws.IsDeleted IS NULL)
            ORDER BY ws.Id DESC
        ) ews
        OUTER APPLY (
            SELECT TOP 1
                r.Summary,
                r.Other,
                r.Dictate
            FROM dbo.EHRRestrictions r
            WHERE r.CheckInId = ch.Id
              AND (r.IsDeleted = 0 OR r.IsDeleted IS NULL)
            ORDER BY r.Id DESC
        ) er
        WHERE ch.Id = ?
          AND ch.PatientId = ?
          AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
          AND (p.IsDeleted = 0 OR p.IsDeleted IS NULL)
    """
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(sql, (int(check_in_id), int(patient_id)))
        row = cursor.fetchone()
        if not row:
            return None
        columns = [col[0] for col in cursor.description]
        return dict(zip(columns, row))


def _row_to_patient_visit_document(row: dict) -> PatientVisitDocument | None:
    report_name = (
        (row.get("ReportName") or "").strip()
        or (row.get("ReportTableName") or "").strip()
        or (row.get("ReportTitle") or "").strip()
        or (row.get("Name") or "").strip()
        or "Document"
    )
    folder = (row.get("Path") or "").strip()
    badge = _preview_badge(row.get("ReportId"), report_name)
    return PatientVisitDocument(
        id=int(row["Id"]),
        check_in_id=int(row["CheckInId"]),
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


def _fetch_documents_for_checkin(clinic, check_in_id: int) -> list[PatientVisitDocument]:
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
                dp.IsComplated,
                CONVERT(varchar(30), dp.CreatedDateTime, 126) AS CreatedDateTime,
                r.Name AS ReportTableName,
                r.ReportTitle
            FROM dbo.DocterPublishes dp
            LEFT JOIN dbo.Reports r ON r.Id = dp.ReportId
            WHERE dp.CheckInId = ?
              AND (dp.IsDeleted = 0 OR dp.IsDeleted IS NULL)
            ORDER BY dp.Id ASC
            """,
            (int(check_in_id),),
        )
        columns = [col[0] for col in cursor.description]
        rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

    return build_grouped_visit_documents(
        rows,
        row_to_document=_row_to_patient_visit_document,
    )


def _fetch_other_visits(
    *,
    clinic,
    patient_id: int,
    exclude_check_in_id: int,
) -> list[PatientVisitOtherRow]:
    today = date.today()
    start = today - timedelta(days=VISIT_LOOKBACK_DAYS)
    sql = """
        SELECT
            ch.Id AS CheckInId,
            ch.CheckInDate,
            ch.CheckOutDate,
            ch.CheckInStatusId,
            vt.Code AS VisitTypeCode,
            vt.CategoryId AS VisitCategoryId,
            COALESCE(
                NULLIF(LTRIM(RTRIM(prov.Name)), ''),
                NULLIF(
                    LTRIM(RTRIM(ISNULL(prov.FirstName, '') + ' ' + ISNULL(prov.LastName, ''))),
                    ''
                ),
                NULLIF(LTRIM(RTRIM(ar.Name)), ''),
                '—'
            ) AS ProviderName,
            COALESCE(NULLIF(LTRIM(RTRIM(loc.Name)), ''), '—') AS LocationName
        FROM dbo.CheckInsHeader ch
        LEFT JOIN dbo.VisitTypes vt ON vt.Id = ch.VisitTypeId
        LEFT JOIN dbo.Providers prov ON prov.Id = ch.ProviderId
        LEFT JOIN dbo.Locations loc ON loc.Id = ch.LocationId
        LEFT JOIN dbo.AppointmentResources ar ON ar.Id = ch.ResourceId
        WHERE ch.PatientId = ?
          AND ch.Id <> ?
          AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
          AND ch.CheckInDate IS NOT NULL
          AND ch.CheckInDate >= ?
          AND ch.CheckInDate <= ?
        ORDER BY ch.CheckInDate DESC, ch.Id DESC
    """
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            sql,
            (int(patient_id), int(exclude_check_in_id), start, today),
        )
        columns = [col[0] for col in cursor.description]
        rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

    items: list[PatientVisitOtherRow] = []
    for row in rows:
        check_in_id = int(row["CheckInId"])
        items.append(
            PatientVisitOtherRow(
                id=str(check_in_id),
                check_in_id=check_in_id,
                category=_visit_category(
                    row.get("VisitCategoryId"),
                    row.get("VisitTypeCode"),
                ),
                provider=_provider_name(row),
                location=_location_name(row),
                date=_format_display_date(row.get("CheckInDate")),
                date_value=_format_date_iso(row.get("CheckInDate")),
                status=_status_label(row),
            )
        )
    return items


def _map_patient_info(row: dict, patient_id: int) -> PatientVisitPatientInfo:
    first = (row.get("FirstName") or "").strip()
    last = (row.get("LastName") or "").strip()
    full_name = " ".join(part for part in [first, last] if part).strip() or "Patient"

    phone = (
        (row.get("CellPhone") or "").strip()
        or (row.get("HomePhone") or "").strip()
        or (row.get("WorkPhone") or "").strip()
        or None
    )

    address_parts = [
        (row.get("Address1") or "").strip(),
        (row.get("Address2") or "").strip(),
        ", ".join(
            part
            for part in [
                (row.get("City") or "").strip(),
                (row.get("State") or "").strip(),
                (row.get("ZipCode") or "").strip(),
            ]
            if part
        ),
    ]
    address_lines = [part for part in address_parts if part]
    address = ", ".join(address_lines) if address_lines else None
    account = row.get("AccountNumber")
    account_no = str(account).strip() if account is not None else None

    return PatientVisitPatientInfo(
        patient_id=patient_id,
        full_name=full_name,
        account_no=account_no or None,
        gender=_gender_short(row.get("GenderId")),
        date_of_birth=_format_display_date(row.get("DateOfBirth")),
        phone=phone,
        email=(row.get("PatientEmail") or "").strip() or None,
        address=address,
        address_lines=address_lines,
        insurance_name=(row.get("InsuranceName") or "").strip() or None,
        insurance_plan=None,
        employer_name=(row.get("EmployerName") or "").strip() or None,
        employer_department=None,
    )


def _provider_name(row: dict) -> str:
    return (row.get("ProviderName") or "").strip() or "—"


def _location_name(row: dict) -> str:
    return (row.get("LocationName") or "").strip() or "—"


def _status_label(row: dict) -> str:
    if row.get("CheckOutDate") is not None:
        return "Completed"
    status_id = row.get("CheckInStatusId")
    try:
        if status_id is not None:
            return _CHECKIN_STATUS_LABELS.get(int(status_id), "Completed")
    except (TypeError, ValueError):
        pass
    return "Completed"


def _work_status_label(row: dict) -> str | None:
    shift_id = row.get("CurrentWorkShiftTypeId")
    if shift_id is None:
        shift_id = row.get("WorkStatusId")
    label = shift_type_label(shift_id)
    if not label:
        return None

    start = _as_date(row.get("CurrentWorkShiftFromDate"))
    end = _as_date(row.get("CurrentWorkShiftToDate"))
    if start and end and end >= start:
        days = (end - start).days + 1
        if days > 0:
            unit = "day" if days == 1 else "days"
            return f"{label} — {days} {unit}"
    return label


def _special_instructions(row: dict) -> str | None:
    for key in (
        "WorkStatusSpecialInstructions",
        "HeaderSpecialInstructions",
        "CheckInInstructions",
        "CheckInNotes",
    ):
        text = (row.get(key) or "").strip()
        if text:
            return text
    return None


def _restrictions_text(row: dict) -> str | None:
    other = (row.get("RestrictionOther") or "").strip()
    if other:
        return other
    dictate = (row.get("RestrictionDictate") or "").strip()
    if dictate:
        return dictate
    summary = (row.get("RestrictionSummary") or "").strip()
    if not summary:
        return None
    # Keep the demographics-style field readable; full text can be long.
    if len(summary) <= 160:
        return summary
    return summary[:157].rstrip() + "…"


def _visit_category(category_id, code) -> str | None:
    normalized = (code or "").strip().upper()
    if normalized == "PDS":
        return "Drug Screen"
    try:
        cid = int(category_id) if category_id is not None else None
    except (TypeError, ValueError):
        cid = None
    if cid == 1:
        return "Injury"
    if cid == 2:
        return "Physical"
    if cid == 3:
        return "Urgent Care"
    if cid == 4:
        return "Personal Injury"
    return None


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


def _as_date(value) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return None

