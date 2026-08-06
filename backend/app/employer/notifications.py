"""Read-only employer notification projection (SELECT only).

Sources domain tables (SharedDocuments, appointments, work statuses) —
not AuditLogEntries and not dbo.Notification (validation catalog).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.db.clinic import get_clinic_by_activation_key, get_clinic_connection
from app.employer.profile import EmployerProfile, fetch_profile_from_clinic
from app.employer.schemas import (
    MarkNotificationsReadResponse,
    NotificationItem,
    NotificationsResponse,
)

# DocumentUploads.ObjectTypeId for CheckInsHeader (observed in clinic DB).
_CHECKIN_OBJECT_TYPE_ID = 53
# SharedDocuments.DocumentTypeId for DocumentUploads rows.
_SHARED_DOC_UPLOAD_TYPE_ID = 2

# All notification sources are limited to this recent window.
LOOKBACK_DAYS = 30
# Appointments / work-status items newer than this count as unread (no IsRead flag).
UNREAD_HEURISTIC_DAYS = 3

DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 50
# Cap merged rows fetched before pagination (30-day window).
_MAX_FETCH_PER_SOURCE = 200


def list_notifications(
    current_user: CurrentUser,
    *,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> NotificationsResponse:
    from math import ceil

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

    page_size = min(max(int(page_size or DEFAULT_PAGE_SIZE), 1), MAX_PAGE_SIZE)
    page = max(int(page or 1), 1)

    items = _project_notifications(
        clinic,
        profile,
        fetch_limit=_MAX_FETCH_PER_SOURCE,
        lookback_days=LOOKBACK_DAYS,
    )
    items.sort(key=lambda item: item.created_at or "", reverse=True)

    total = len(items)
    total_pages = max(1, ceil(total / page_size)) if total else 1
    if page > total_pages:
        page = total_pages

    offset = (page - 1) * page_size
    page_items = items[offset : offset + page_size]
    unread = sum(1 for item in items if item.unread)

    return NotificationsResponse(
        items=page_items,
        total=total,
        unread_count=unread,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        days=LOOKBACK_DAYS,
        employer_id=profile.employer_id,
    )


def count_unread_notifications(clinic, profile: EmployerProfile) -> int:
    """Unread count for dashboard KPI / bell (SELECT only, last 30 days)."""
    items = _project_notifications(
        clinic,
        profile,
        fetch_limit=_MAX_FETCH_PER_SOURCE,
        lookback_days=LOOKBACK_DAYS,
    )
    return sum(1 for item in items if item.unread)


def mark_notifications_read(current_user: CurrentUser) -> MarkNotificationsReadResponse:
    """
    Mark SharedDocuments as viewed for the current portal recipient.
    Appointment / work-status unread uses a client last-opened heuristic
    (no durable read flag on those tables).
    """
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

    updated = _mark_shared_documents_viewed(clinic, profile)
    return MarkNotificationsReadResponse(
        updated_count=updated,
        employer_id=profile.employer_id,
    )


def _mark_shared_documents_viewed(clinic, profile: EmployerProfile) -> int:
    email_norm = (profile.email or "").strip().lower() or None
    # UPDATE has no table alias — use bare column names (not sd.*).
    recipient_sql, recipient_params = _recipient_clause(
        profile.user_id, email_norm, alias=""
    )
    if recipient_sql == "1 = 0":
        return 0

    actor_id = int(profile.user_id) if profile.user_id is not None else 0
    sql = f"""
        UPDATE dbo.SharedDocuments
        SET IsViewed = 1,
            UpdatedDateTime = SYSUTCDATETIME(),
            UpdatedUserId = ?
        WHERE (IsDeleted = 0 OR IsDeleted IS NULL)
          AND (IsViewed = 0 OR IsViewed IS NULL)
          AND ({recipient_sql})
    """
    params: list[Any] = [actor_id, *recipient_params]

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(sql, tuple(params))
        return int(cursor.rowcount or 0)


def unread_shared_report_counts_by_patient(
    clinic,
    *,
    employer_id: int,
    patient_ids: list[int],
    user_id: int | None,
    email: str | None,
) -> dict[int, int]:
    """
    Per-patient count of unviewed SharedDocuments linked to that patient's
    check-ins, scoped to the current portal user (email / ShareWithUserId).
    """
    if not patient_ids:
        return {}

    email_norm = (email or "").strip().lower() or None
    placeholders = ",".join("?" for _ in patient_ids)
    recipient_sql, recipient_params = _recipient_clause(user_id, email_norm)

    sql = f"""
        SELECT
            ch.PatientId AS PatientId,
            COUNT(*) AS UnreadCount
        FROM dbo.SharedDocuments sd
        INNER JOIN dbo.DocumentUploads du
            ON du.Id = sd.DocumentId
           AND sd.DocumentTypeId = ?
           AND (du.IsDeleted = 0 OR du.IsDeleted IS NULL)
        INNER JOIN dbo.CheckInsHeader ch
            ON ch.Id = du.HeaderObjectId
           AND du.ObjectTypeId = ?
           AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
        WHERE (sd.IsDeleted = 0 OR sd.IsDeleted IS NULL)
          AND (sd.IsViewed = 0 OR sd.IsViewed IS NULL)
          AND ch.EmployerId = ?
          AND ch.PatientId IN ({placeholders})
          AND ({recipient_sql})
        GROUP BY ch.PatientId
    """
    params: list[Any] = [
        _SHARED_DOC_UPLOAD_TYPE_ID,
        _CHECKIN_OBJECT_TYPE_ID,
        employer_id,
        *patient_ids,
        *recipient_params,
    ]

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(sql, tuple(params))
        rows = cursor.fetchall()

    return {int(row.PatientId): int(row.UnreadCount or 0) for row in rows}


def _project_notifications(
    clinic,
    profile: EmployerProfile,
    *,
    fetch_limit: int,
    lookback_days: int = LOOKBACK_DAYS,
) -> list[NotificationItem]:
    per_source = max(5, fetch_limit)
    shared = _fetch_shared_document_notifications(
        clinic,
        profile,
        limit=per_source,
        lookback_days=lookback_days,
    )
    appts = _fetch_appointment_notifications(
        clinic,
        profile.employer_id,
        limit=per_source,
        lookback_days=lookback_days,
    )
    work = _fetch_work_status_notifications(
        clinic,
        profile.employer_id,
        limit=per_source,
        lookback_days=lookback_days,
    )
    return [*shared, *appts, *work]


def _recipient_clause(
    user_id: int | None,
    email_norm: str | None,
    *,
    alias: str = "sd",
) -> tuple[str, list[Any]]:
    """
    Build recipient match SQL.
    alias="sd" for SELECT joins; alias="" for UPDATE dbo.SharedDocuments (no alias).
    """
    prefix = f"{alias}." if alias else ""
    clauses: list[str] = []
    params: list[Any] = []
    if user_id is not None:
        clauses.append(f"{prefix}ShareWithUserId = ?")
        params.append(int(user_id))
    if email_norm:
        clauses.append(
            f"LOWER(LTRIM(RTRIM(ISNULL({prefix}Email, '')))) = ?"
        )
        params.append(email_norm)
    if not clauses:
        # No identity → match nothing (avoid leaking clinic-wide shares).
        return "1 = 0", []
    return " OR ".join(clauses), params


def _fetch_shared_document_notifications(
    clinic,
    profile: EmployerProfile,
    *,
    limit: int,
    lookback_days: int = LOOKBACK_DAYS,
) -> list[NotificationItem]:
    email_norm = (profile.email or "").strip().lower() or None
    recipient_sql, recipient_params = _recipient_clause(profile.user_id, email_norm)

    sql = f"""
        SELECT TOP (?)
            sd.Id AS ShareId,
            sd.IsViewed,
            CONVERT(varchar(33), sd.CreatedDateTime, 127) AS CreatedAt,
            du.FileName,
            du.ReportId,
            r.Name AS ReportName,
            r.ReportTitle,
            ch.PatientId,
            p.FirstName,
            p.LastName
        FROM dbo.SharedDocuments sd
        LEFT JOIN dbo.DocumentUploads du
            ON du.Id = sd.DocumentId
           AND sd.DocumentTypeId = ?
           AND (du.IsDeleted = 0 OR du.IsDeleted IS NULL)
        LEFT JOIN dbo.Reports r ON r.Id = du.ReportId
        LEFT JOIN dbo.CheckInsHeader ch
            ON ch.Id = du.HeaderObjectId
           AND du.ObjectTypeId = ?
           AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
        LEFT JOIN dbo.Patients p ON p.Id = ch.PatientId
        WHERE (sd.IsDeleted = 0 OR sd.IsDeleted IS NULL)
          AND ({recipient_sql})
          AND (
                ch.EmployerId = ?
             OR ch.EmployerId IS NULL
          )
          AND sd.CreatedDateTime >= DATEADD(day, ?, SYSUTCDATETIME())
        ORDER BY sd.Id DESC
    """
    params: list[Any] = [
        limit,
        _SHARED_DOC_UPLOAD_TYPE_ID,
        _CHECKIN_OBJECT_TYPE_ID,
        *recipient_params,
        profile.employer_id,
        -int(lookback_days),
    ]

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(sql, tuple(params))
        columns = [col[0] for col in cursor.description]
        rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

    items: list[NotificationItem] = []
    for row in rows:
        name = _patient_display_name(row.get("FirstName"), row.get("LastName"))
        report = (
            (row.get("ReportTitle") or "").strip()
            or (row.get("ReportName") or "").strip()
            or (row.get("FileName") or "").strip()
            or "document"
        )
        if name != "an employee":
            message = f"New report shared for {name}: {report}"
        else:
            message = f"New document shared: {report}"

        created_at = _normalize_created_at(row.get("CreatedAt"))
        unread = not bool(row.get("IsViewed"))

        items.append(
            NotificationItem(
                id=f"share-{int(row['ShareId'])}",
                message=message,
                created_at=created_at,
                time_ago=_time_ago(created_at),
                unread=unread,
                href=None,
                source="shared_document",
                source_id=int(row["ShareId"]),
            )
        )
    return items


def _fetch_appointment_notifications(
    clinic,
    employer_id: int,
    *,
    limit: int,
    lookback_days: int = LOOKBACK_DAYS,
) -> list[NotificationItem]:
    sql = """
        SELECT TOP (?)
            s.Id AS ScheduleId,
            COALESCE(a.PatientId, ch.PatientId) AS PatientId,
            p.FirstName,
            p.LastName,
            vt.Description AS VisitTypeDescription,
            vt.Code AS VisitTypeCode,
            CONVERT(varchar(33), s.CreatedDateTime, 127) AS CreatedAt,
            CONVERT(varchar(10), s.Date, 23) AS ApptDate,
            CONVERT(varchar(8), s.StartTime, 108) AS ApptTime
        FROM dbo.AppointmentSchedules s
        LEFT JOIN dbo.Appointments a ON a.Id = s.AppointmentId
        LEFT JOIN dbo.CheckInsHeader ch ON ch.Id = s.CheckInId
        LEFT JOIN dbo.Patients p ON p.Id = COALESCE(a.PatientId, ch.PatientId)
        LEFT JOIN dbo.VisitTypes vt ON vt.Id = COALESCE(a.VisitTypeId, ch.VisitTypeId)
        WHERE (s.IsDeleted = 0 OR s.IsDeleted IS NULL)
          AND COALESCE(a.EmployerId, ch.EmployerId) = ?
          AND s.CreatedDateTime >= DATEADD(day, ?, SYSUTCDATETIME())
        ORDER BY s.CreatedDateTime DESC, s.Id DESC
    """
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            sql,
            (limit, employer_id, -int(lookback_days)),
        )
        columns = [col[0] for col in cursor.description]
        rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

    items: list[NotificationItem] = []
    for row in rows:
        name = _patient_display_name(row.get("FirstName"), row.get("LastName"))
        visit = (
            (row.get("VisitTypeDescription") or "").strip()
            or (row.get("VisitTypeCode") or "").strip()
            or "appointment"
        )
        when = _format_appt_when(row.get("ApptDate"), row.get("ApptTime"))
        message = f"Appointment confirmed for {name}"
        if when:
            message = f"{message} ({visit}, {when})"
        else:
            message = f"{message} ({visit})"

        created_at = _normalize_created_at(row.get("CreatedAt"))

        items.append(
            NotificationItem(
                id=f"appt-{int(row['ScheduleId'])}",
                message=message,
                created_at=created_at,
                time_ago=_time_ago(created_at),
                unread=_is_recently_created(created_at, UNREAD_HEURISTIC_DAYS),
                href=None,
                source="appointment",
                source_id=int(row["ScheduleId"]),
            )
        )
    return items


def _fetch_work_status_notifications(
    clinic,
    employer_id: int,
    *,
    limit: int,
    lookback_days: int = LOOKBACK_DAYS,
) -> list[NotificationItem]:
    sql = """
        SELECT TOP (?)
            ws.Id AS WorkStatusId,
            ws.CheckInId,
            ch.PatientId,
            p.FirstName,
            p.LastName,
            CONVERT(varchar(33), ws.CreatedDateTime, 127) AS CreatedAt
        FROM dbo.EHRWorkStatuses ws
        INNER JOIN dbo.CheckInsHeader ch ON ch.Id = ws.CheckInId
        LEFT JOIN dbo.Patients p ON p.Id = ch.PatientId
        WHERE (ws.IsDeleted = 0 OR ws.IsDeleted IS NULL)
          AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
          AND ch.EmployerId = ?
          AND ws.CreatedDateTime >= DATEADD(day, ?, SYSUTCDATETIME())
        ORDER BY ws.CreatedDateTime DESC, ws.Id DESC
    """
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            sql,
            (limit, employer_id, -int(lookback_days)),
        )
        columns = [col[0] for col in cursor.description]
        rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

    items: list[NotificationItem] = []
    for row in rows:
        name = _patient_display_name(row.get("FirstName"), row.get("LastName"))
        message = f"Work status updated for {name}"
        created_at = _normalize_created_at(row.get("CreatedAt"))

        items.append(
            NotificationItem(
                id=f"ws-{int(row['WorkStatusId'])}",
                message=message,
                created_at=created_at,
                time_ago=_time_ago(created_at),
                unread=_is_recently_created(created_at, UNREAD_HEURISTIC_DAYS),
                href=None,
                source="work_status",
                source_id=int(row["WorkStatusId"]),
            )
        )
    return items


def _patient_display_name(first: Any, last: Any) -> str:
    parts = [(first or "").strip(), (last or "").strip()]
    name = " ".join(part for part in parts if part).strip()
    return name or "an employee"


def _normalize_created_at(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    # Ensure Z-style UTC when SQL returns offset-less / with fractional seconds.
    if text.endswith("Z") or "+" in text[10:] or text.endswith("00"):
        return text.replace("+00:00", "Z") if text.endswith("+00:00") else text
    return text


def _parse_created_at(value: str | None) -> datetime | None:
    if not value:
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        # Truncate fractional seconds if needed
        if "." in text:
            head, rest = text.split(".", 1)
            frac = "".join(ch for ch in rest if ch.isdigit())[:6]
            tz = ""
            for i, ch in enumerate(rest):
                if ch in "+-" and i > 0:
                    tz = rest[i:]
                    break
            try:
                parsed = datetime.fromisoformat(f"{head}.{frac}{tz or '+00:00'}")
            except ValueError:
                return None
        else:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _is_recently_created(created_at: str | None, days: int) -> bool:
    parsed = _parse_created_at(created_at)
    if not parsed:
        return False
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    return parsed >= cutoff


def _time_ago(created_at: str | None) -> str:
    parsed = _parse_created_at(created_at)
    if not parsed:
        return ""
    now = datetime.now(timezone.utc)
    delta = now - parsed.astimezone(timezone.utc)
    seconds = int(delta.total_seconds())
    if seconds < 0:
        return "Just now"
    if seconds < 60:
        return "Just now"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes} min ago" if minutes == 1 else f"{minutes} min ago"
    hours = minutes // 60
    if hours < 24:
        return "1 hr ago" if hours == 1 else f"{hours} hrs ago"
    days = hours // 24
    if days == 1:
        return "Yesterday"
    if days < 7:
        return f"{days} days ago"
    return parsed.astimezone(timezone.utc).strftime("%b %d, %Y")


def _format_appt_when(appt_date: Any, appt_time: Any) -> str | None:
    date_part = (str(appt_date).strip() if appt_date else "")[:10]
    time_part = str(appt_time).strip() if appt_time else ""
    display_date = date_part
    if date_part and len(date_part) == 10:
        try:
            display_date = datetime.strptime(date_part, "%Y-%m-%d").strftime("%b %d")
        except ValueError:
            pass
    display_time = ""
    if time_part:
        try:
            parsed_t = datetime.strptime(time_part[:8], "%H:%M:%S")
            display_time = parsed_t.strftime("%I:%M %p").lstrip("0")
        except ValueError:
            display_time = time_part
    parts = [p for p in [display_date, display_time] if p]
    return ", ".join(parts) if parts else None
