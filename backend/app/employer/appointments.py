from __future__ import annotations

from datetime import date, datetime, time, timedelta
from math import ceil

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.db.clinic import get_clinic_by_activation_key, get_clinic_connection
from app.employer.schemas import UpcomingAppointmentsResponse, UpcomingAppointmentRow
from app.employer.profile import fetch_profile_from_clinic

DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 50

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


def appointment_count_upcoming(clinic, employer_id: int) -> int:
    """Read-only count of upcoming (now-or-future) schedules for this employer."""
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT COUNT(*)
            FROM dbo.AppointmentSchedules s
            LEFT JOIN dbo.Appointments a ON a.Id = s.AppointmentId
            LEFT JOIN dbo.CheckInsHeader ch ON ch.Id = s.CheckInId
            WHERE (s.IsDeleted = 0 OR s.IsDeleted IS NULL)
              AND COALESCE(a.EmployerId, ch.EmployerId) = ?
              AND s.Date IS NOT NULL
              AND s.StartTime IS NOT NULL
              AND (
                    s.Date > CAST(GETDATE() AS date)
                 OR (
                        s.Date = CAST(GETDATE() AS date)
                    AND s.StartTime >= CAST(GETDATE() AS time)
                    )
              )
            """,
            (employer_id,),
        )
        return int(cursor.fetchone()[0])


def appointment_count_last_30_days(clinic, employer_id: int) -> int:
    """Backward-compatible alias — dashboard appointments KPI uses upcoming count. """
    return appointment_count_upcoming(clinic, employer_id)


def list_upcoming_appointments(
    current_user: CurrentUser,
    *,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> UpcomingAppointmentsResponse:
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

    page_size = min(max(page_size, 1), MAX_PAGE_SIZE)
    page = max(page, 1)

    total = _count_upcoming(clinic, profile.employer_id)
    total_pages = max(1, ceil(total / page_size)) if total else 1
    if page > total_pages:
        page = total_pages

    offset = (page - 1) * page_size
    rows = _fetch_upcoming_rows(
        clinic,
        profile.employer_id,
        offset=offset,
        limit=page_size,
    )

    return UpcomingAppointmentsResponse(
        items=rows,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        employer_id=profile.employer_id,
    )


def _count_upcoming(clinic, employer_id: int) -> int:
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT COUNT(*)
            FROM dbo.AppointmentSchedules s
            LEFT JOIN dbo.Appointments a ON a.Id = s.AppointmentId
            LEFT JOIN dbo.CheckInsHeader ch ON ch.Id = s.CheckInId
            WHERE (s.IsDeleted = 0 OR s.IsDeleted IS NULL)
              AND COALESCE(a.EmployerId, ch.EmployerId) = ?
              AND s.Date IS NOT NULL
              AND s.StartTime IS NOT NULL
              AND (
                    s.Date > CAST(GETDATE() AS date)
                 OR (
                        s.Date = CAST(GETDATE() AS date)
                    AND s.StartTime >= CAST(GETDATE() AS time)
                    )
              )
            """,
            (employer_id,),
        )
        return int(cursor.fetchone()[0])


def _fetch_upcoming_rows(
    clinic,
    employer_id: int,
    *,
    offset: int,
    limit: int,
) -> list[UpcomingAppointmentRow]:
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                s.Id AS ScheduleId,
                s.Date,
                s.StartTime,
                s.AppointmentStatusId,
                COALESCE(a.Id, s.AppointmentId) AS AppointmentId,
                COALESCE(a.PatientId, ch.PatientId) AS PatientId,
                COALESCE(a.VisitTypeId, ch.VisitTypeId) AS VisitTypeId,
                p.FirstName,
                p.LastName,
                vt.Description AS VisitTypeDescription,
                vt.Code AS VisitTypeCode,
                vt.CategoryId AS VisitCategoryId,
                ar.Name AS ResourceName,
                loc.Name AS LocationName
            FROM dbo.AppointmentSchedules s
            LEFT JOIN dbo.Appointments a ON a.Id = s.AppointmentId
            LEFT JOIN dbo.CheckInsHeader ch ON ch.Id = s.CheckInId
            LEFT JOIN dbo.Patients p ON p.Id = COALESCE(a.PatientId, ch.PatientId)
            LEFT JOIN dbo.VisitTypes vt ON vt.Id = COALESCE(a.VisitTypeId, ch.VisitTypeId)
            LEFT JOIN dbo.AppointmentResources ar ON ar.Id = s.ResourceId
            LEFT JOIN dbo.Locations loc ON loc.Id = s.LocationId
            WHERE (s.IsDeleted = 0 OR s.IsDeleted IS NULL)
              AND COALESCE(a.EmployerId, ch.EmployerId) = ?
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
            OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
            """,
            (employer_id, offset, limit),
        )
        columns = [col[0] for col in cursor.description]
        db_rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

    return [_map_upcoming_row(row) for row in db_rows]


def _map_upcoming_row(row: dict) -> UpcomingAppointmentRow:
    patient_id = row.get("PatientId")
    schedule_id = int(row["ScheduleId"])
    appointment_id = row.get("AppointmentId")

    first = (row.get("FirstName") or "").strip()
    last = (row.get("LastName") or "").strip()
    employee_name = " ".join(part for part in [first, last] if part).strip() or "Unknown"

    status_id = row.get("AppointmentStatusId")
    status_label = _appointment_status_label(status_id)

    visit_type = row.get("VisitTypeDescription") or row.get("VisitTypeCode") or "Appointment"
    category = _visit_category(row.get("VisitCategoryId"), row.get("VisitTypeCode"))

    provider = (row.get("ResourceName") or "").strip() or None
    clinic_name = (row.get("LocationName") or "").strip() or None

    date_iso = _format_date_iso(row.get("Date"))

    return UpcomingAppointmentRow(
        id=f"appt-{schedule_id}",
        schedule_id=schedule_id,
        appointment_id=int(appointment_id) if appointment_id is not None else None,
        patient_id=int(patient_id) if patient_id is not None else None,
        employee_id=str(patient_id) if patient_id is not None else None,
        employee_name=employee_name,
        category=category,
        visit_type=visit_type,
        provider=provider,
        clinic=clinic_name,
        date=_format_display_date(row.get("Date")),
        date_value=date_iso,
        time=_format_time_display(row.get("StartTime")),
        status=status_label,
        appointment_status_id=int(status_id) if status_id is not None else None,
    )


def _appointment_status_label(status_id: int | None) -> str:
    if status_id is None:
        return "Pending"
    try:
        key = int(status_id)
    except (TypeError, ValueError):
        return "Pending"
    return _APPOINTMENT_STATUS_LABELS.get(key, "Pending")


def _visit_category(category_id: int | None, code: str | None) -> str | None:
    normalized = (code or "").strip().upper()
    if normalized == "PDS":
        return "Drug Screen"
    if category_id == 1:
        return "Injury"
    if category_id == 2:
        return "Physical"
    if category_id == 3:
        return "Urgent Care"
    if category_id == 4:
        return "Personal Injury"
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


def _format_time_display(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        value = value.time()
    if isinstance(value, time):
        return value.strftime("%I:%M %p").lstrip("0")
    return str(value)
