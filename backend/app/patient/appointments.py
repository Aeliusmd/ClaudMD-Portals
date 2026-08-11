"""Read-only appointments for the logged-in patient."""

from __future__ import annotations

from datetime import date, datetime, time
from math import ceil

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.db.clinic import get_clinic_by_activation_key, get_clinic_connection
from app.patient.profile import fetch_profile_from_clinic
from app.patient.schemas import (
    PatientUpcomingAppointmentRow,
    PatientUpcomingAppointmentsResponse,
)

DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 50

SCOPE_ALL = "all"
SCOPE_UPCOMING = "upcoming"
SCOPE_COMPLETED = "completed"
ALLOWED_SCOPES = {SCOPE_ALL, SCOPE_UPCOMING, SCOPE_COMPLETED}

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

_UPCOMING_SQL = """
              AND (
                    s.Date > CAST(GETDATE() AS date)
                 OR (
                        s.Date = CAST(GETDATE() AS date)
                    AND s.StartTime >= CAST(GETDATE() AS time)
                    )
              )
"""

# ClaudMD: 5 = Seen, 9 = Check-Out
_COMPLETED_SQL = """
              AND (
                    s.AppointmentStatusId IN (5, 9)
                 OR s.Date < CAST(GETDATE() AS date)
                 OR (
                        s.Date = CAST(GETDATE() AS date)
                    AND s.StartTime < CAST(GETDATE() AS time)
                    )
              )
"""


def list_upcoming_appointments(
    current_user: CurrentUser,
    *,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> PatientUpcomingAppointmentsResponse:
    """Upcoming schedules only (dashboard panel)."""
    return list_appointments(
        current_user,
        scope=SCOPE_UPCOMING,
        page=page,
        page_size=page_size,
    )


def list_appointments(
    current_user: CurrentUser,
    *,
    scope: str = SCOPE_ALL,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> PatientUpcomingAppointmentsResponse:
    """
    AppointmentSchedules for the logged-in patient (SELECT only).

    scope:
      all — every non-deleted schedule
      upcoming — now-or-future
      completed — past or status Completed
    """
    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )

    profile = fetch_profile_from_clinic(clinic, current_user)
    if profile.patient_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient record not found for this account.",
        )
    patient_id = int(profile.patient_id)

    scope_key = (scope or SCOPE_ALL).strip().lower()
    if scope_key not in ALLOWED_SCOPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid scope. Use all, upcoming, or completed.",
        )

    page_size = min(max(int(page_size or DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE)
    page = max(int(page or 1), 1)

    total = _count_rows(clinic, patient_id, scope_key)
    total_pages = max(1, ceil(total / page_size)) if total else 1
    if page > total_pages:
        page = total_pages

    offset = (page - 1) * page_size
    rows = _fetch_rows(
        clinic,
        patient_id,
        scope=scope_key,
        offset=offset,
        limit=page_size,
    )

    return PatientUpcomingAppointmentsResponse(
        items=rows,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages if total else 1,
        patient_id=patient_id,
    )


def _scope_sql(scope: str) -> str:
    if scope == SCOPE_UPCOMING:
        return _UPCOMING_SQL
    if scope == SCOPE_COMPLETED:
        return _COMPLETED_SQL
    return ""


def _order_sql(scope: str) -> str:
    if scope == SCOPE_UPCOMING:
        return "ORDER BY s.Date ASC, s.StartTime ASC"
    # Newest first for all / completed lists.
    return "ORDER BY s.Date DESC, s.StartTime DESC"


def _count_rows(clinic, patient_id: int, scope: str) -> int:
    scope_sql = _scope_sql(scope)
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            f"""
            SELECT COUNT(*)
            FROM dbo.AppointmentSchedules s
            LEFT JOIN dbo.Appointments a ON a.Id = s.AppointmentId
            LEFT JOIN dbo.CheckInsHeader ch ON ch.Id = s.CheckInId
            WHERE (s.IsDeleted = 0 OR s.IsDeleted IS NULL)
              AND COALESCE(a.PatientId, ch.PatientId) = ?
              AND s.Date IS NOT NULL
              AND s.StartTime IS NOT NULL
              {scope_sql}
            """,
            (int(patient_id),),
        )
        return int(cursor.fetchone()[0] or 0)


def _fetch_rows(
    clinic,
    patient_id: int,
    *,
    scope: str,
    offset: int,
    limit: int,
) -> list[PatientUpcomingAppointmentRow]:
    scope_sql = _scope_sql(scope)
    order_sql = _order_sql(scope)
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            f"""
            SELECT
                s.Id AS ScheduleId,
                s.Date,
                s.StartTime,
                s.AppointmentStatusId,
                COALESCE(a.Id, s.AppointmentId) AS AppointmentId,
                COALESCE(a.VisitTypeId, ch.VisitTypeId) AS VisitTypeId,
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
                loc.Name AS LocationName
            FROM dbo.AppointmentSchedules s
            LEFT JOIN dbo.Appointments a ON a.Id = s.AppointmentId
            LEFT JOIN dbo.CheckInsHeader ch ON ch.Id = s.CheckInId
            LEFT JOIN dbo.VisitTypes vt
                ON vt.Id = COALESCE(a.VisitTypeId, ch.VisitTypeId)
            LEFT JOIN dbo.AppointmentResources ar ON ar.Id = s.ResourceId
            LEFT JOIN dbo.Providers prov ON prov.Id = ar.ProviderId
            LEFT JOIN dbo.Locations loc ON loc.Id = s.LocationId
            WHERE (s.IsDeleted = 0 OR s.IsDeleted IS NULL)
              AND COALESCE(a.PatientId, ch.PatientId) = ?
              AND s.Date IS NOT NULL
              AND s.StartTime IS NOT NULL
              {scope_sql}
            {order_sql}
            OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
            """,
            (int(patient_id), offset, limit),
        )
        columns = [col[0] for col in cursor.description]
        db_rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

    return [_map_row(row) for row in db_rows]


def _map_row(row: dict) -> PatientUpcomingAppointmentRow:
    schedule_id = int(row["ScheduleId"])
    appointment_id = row.get("AppointmentId")
    category = _visit_category(row.get("VisitCategoryId"), row.get("VisitTypeCode"))
    visit_type = (
        (row.get("VisitTypeDescription") or "").strip()
        or (row.get("VisitTypeCode") or "").strip()
        or "Appointment"
    )
    specialty = category or visit_type

    return PatientUpcomingAppointmentRow(
        id=f"appt-{schedule_id}",
        schedule_id=schedule_id,
        appointment_id=int(appointment_id) if appointment_id is not None else None,
        doctor=(row.get("ProviderName") or "").strip() or "—",
        specialty=specialty,
        type=visit_type,
        category=category,
        location=(row.get("LocationName") or "").strip() or None,
        date=_format_display_date(row.get("Date")),
        date_value=_format_date_iso(row.get("Date")),
        time=_format_time_display(row.get("StartTime")),
        status=_appointment_status_label(row.get("AppointmentStatusId")),
    )


def _appointment_status_label(status_id) -> str:
    if status_id is None:
        return "Pending"
    try:
        key = int(status_id)
    except (TypeError, ValueError):
        return "Pending"
    return _APPOINTMENT_STATUS_LABELS.get(key, "Pending")


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
