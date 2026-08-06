"""Read-only visit documents from dbo.DocterPublishes."""

from __future__ import annotations

from datetime import date, datetime, timedelta, time

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.db.clinic import get_clinic_by_activation_key, get_clinic_connection
from app.employer.schemas import (
    EmployeeVisitDocument,
    EmployeeVisitRecord,
    EmployeeVisitsResponse,
)
from app.employer.profile import fetch_profile_from_clinic


def get_employee_visits(
    current_user: CurrentUser,
    patient_id: int,
    *,
    from_date: date | None = None,
    to_date: date | None = None,
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
    start = from_date or (today - timedelta(days=365))
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
    )
    upcoming = _fetch_upcoming_appointments_for_patient(
        clinic=clinic,
        employer_id=profile.employer_id,
        patient_id=int(patient_id),
    )
    visits = _merge_visit_records(visits, upcoming)

    return EmployeeVisitsResponse(
        patient_id=int(patient_id),
        employer_id=profile.employer_id,
        from_date=start.isoformat(),
        to_date=end.isoformat(),
        visits=visits,
    )


def _fetch_visits_with_documents(
    *,
    clinic,
    employer_id: int,
    patient_id: int,
    from_date: date,
    to_date: date,
) -> list[EmployeeVisitRecord]:
    visit_sql = """
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
    for row in doc_rows:
        check_in_id = int(row["CheckInId"])
        report_name = (
            (row.get("ReportName") or "").strip()
            or (row.get("ReportTableName") or "").strip()
            or (row.get("ReportTitle") or "").strip()
            or (row.get("Name") or "").strip()
            or "Document"
        )
        badge = _preview_badge(row.get("ReportId"), report_name)
        docs_by_checkin.setdefault(check_in_id, []).append(
            EmployeeVisitDocument(
                id=int(row["Id"]),
                check_in_id=check_in_id,
                report_id=int(row["ReportId"]) if row.get("ReportId") is not None else None,
                report_name=report_name,
                name=(row.get("Name") or "").strip() or report_name,
                path=(row.get("Path") or "").strip() or None,
                preview_badge=badge,
                preview_label=badge,
                is_completed=bool(row.get("IsComplated")),
            )
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
) -> list[EmployeeVisitRecord]:
    sql = """
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
    merged = check_in_visits + upcoming_visits
    merged.sort(
        key=lambda visit: (
            visit.check_in_date_value or "",
            visit.is_upcoming,
            visit.time or "",
        ),
        reverse=True,
    )
    return merged


_APPOINTMENT_STATUS_LABELS: dict[int, str] = {
    1: "Confirmed",
    2: "Scheduled",
    3: "Cancelled",
    4: "Pending",
    5: "Completed",
}


def _appointment_status_label(status_id) -> str:
    if status_id is None:
        return "Scheduled"
    try:
        key = int(status_id)
    except (TypeError, ValueError):
        return "Scheduled"
    return _APPOINTMENT_STATUS_LABELS.get(key, "Scheduled")


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
