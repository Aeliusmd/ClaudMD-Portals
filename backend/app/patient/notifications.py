"""Read-only patient notification projection (SELECT only).

Mirrors employer/insurance: projects SharedDocuments, appointments, and
work statuses for the logged-in patient's chart — not AuditLogEntries /
dbo.Notification.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from math import ceil
from typing import Any

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.db.clinic import (
    get_clinic_by_activation_key,
    get_clinic_connection,
    shared_documents_has_is_viewed,
)
from app.patient.profile import PatientProfile, fetch_profile_from_clinic
from app.patient.schemas import (
    PatientMarkNotificationsReadResponse,
    PatientNotificationItem,
    PatientNotificationsResponse,
)

_CHECKIN_OBJECT_TYPE_ID = 53
_SHARED_DOC_UPLOAD_TYPE_ID = 2

LOOKBACK_DAYS = 30
UNREAD_HEURISTIC_DAYS = 3
DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 50
_MAX_FETCH_PER_SOURCE = 200


def list_notifications(
    current_user: CurrentUser,
    *,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
) -> PatientNotificationsResponse:
    clinic, profile = _require_patient_context(current_user)

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

    return PatientNotificationsResponse(
        items=page_items,
        total=total,
        unread_count=unread,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        days=LOOKBACK_DAYS,
        patient_id=profile.patient_id,
    )


def mark_notifications_read(
    current_user: CurrentUser,
) -> PatientMarkNotificationsReadResponse:
    """Mark SharedDocuments.IsViewed for shares addressed to this patient user."""
    clinic, profile = _require_patient_context(current_user)
    updated = _mark_shared_documents_viewed(clinic, profile)
    return PatientMarkNotificationsReadResponse(
        updated_count=updated,
        patient_id=profile.patient_id,
    )


def _require_patient_context(current_user: CurrentUser):
    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )
    profile = fetch_profile_from_clinic(clinic, current_user)
    return clinic, profile


def _mark_shared_documents_viewed(clinic, profile: PatientProfile) -> int:
    if not shared_documents_has_is_viewed(clinic):
        return 0

    email_norm = (profile.email or "").strip().lower() or None
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
        updated = cursor.rowcount if cursor.rowcount and cursor.rowcount > 0 else 0
        conn.commit()
    return int(updated)


def _project_notifications(
    clinic,
    profile: PatientProfile,
    *,
    fetch_limit: int,
    lookback_days: int = LOOKBACK_DAYS,
) -> list[PatientNotificationItem]:
    per_source = max(5, fetch_limit)
    shared = _fetch_shared_document_notifications(
        clinic,
        profile,
        limit=per_source,
        lookback_days=lookback_days,
    )
    appts: list[PatientNotificationItem] = []
    work: list[PatientNotificationItem] = []
    if profile.patient_id is not None:
        appts = _fetch_appointment_notifications(
            clinic,
            int(profile.patient_id),
            limit=per_source,
            lookback_days=lookback_days,
        )
        work = _fetch_work_status_notifications(
            clinic,
            int(profile.patient_id),
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
    prefix = f"{alias}." if alias else ""
    clauses: list[str] = []
    params: list[Any] = []
    if user_id is not None:
        clauses.append(f"{prefix}ShareWithUserId = ?")
        params.append(int(user_id))
    if email_norm:
        clauses.append(f"LOWER(LTRIM(RTRIM(ISNULL({prefix}Email, '')))) = ?")
        params.append(email_norm)
    if not clauses:
        return "1 = 0", []
    return " OR ".join(clauses), params


def _fetch_shared_document_notifications(
    clinic,
    profile: PatientProfile,
    *,
    limit: int,
    lookback_days: int = LOOKBACK_DAYS,
) -> list[PatientNotificationItem]:
    email_norm = (profile.email or "").strip().lower() or None
    recipient_sql, recipient_params = _recipient_clause(profile.user_id, email_norm)
    has_is_viewed = shared_documents_has_is_viewed(clinic)
    is_viewed_select = "sd.IsViewed" if has_is_viewed else "CAST(0 AS bit) AS IsViewed"

    patient_scope_sql = "1 = 0"
    patient_params: list[Any] = []
    if profile.patient_id is not None:
        patient_scope_sql = "ch.PatientId = ?"
        patient_params = [int(profile.patient_id)]

    sql = f"""
        SELECT TOP (?)
            sd.Id AS ShareId,
            {is_viewed_select},
            CONVERT(varchar(33), sd.CreatedDateTime, 127) AS CreatedAt,
            du.FileName,
            du.ReportId,
            r.Name AS ReportName,
            r.ReportTitle
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
        WHERE (sd.IsDeleted = 0 OR sd.IsDeleted IS NULL)
          AND (
                ({recipient_sql})
             OR ({patient_scope_sql})
          )
          AND sd.CreatedDateTime >= DATEADD(day, ?, SYSUTCDATETIME())
        ORDER BY sd.Id DESC
    """
    params: list[Any] = [
        limit,
        _SHARED_DOC_UPLOAD_TYPE_ID,
        _CHECKIN_OBJECT_TYPE_ID,
        *recipient_params,
        *patient_params,
        -int(lookback_days),
    ]

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(sql, tuple(params))
        columns = [col[0] for col in cursor.description]
        rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

    items: list[PatientNotificationItem] = []
    for row in rows:
        report = (
            (row.get("ReportTitle") or "").strip()
            or (row.get("ReportName") or "").strip()
            or (row.get("FileName") or "").strip()
            or "document"
        )
        message = f"New document shared: {report}"
        created_at = _normalize_created_at(row.get("CreatedAt"))
        unread = not bool(row.get("IsViewed")) if has_is_viewed else True
        items.append(
            PatientNotificationItem(
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
    patient_id: int,
    *,
    limit: int,
    lookback_days: int = LOOKBACK_DAYS,
) -> list[PatientNotificationItem]:
    sql = """
        SELECT TOP (?)
            s.Id AS ScheduleId,
            vt.Description AS VisitTypeDescription,
            vt.Code AS VisitTypeCode,
            CONVERT(varchar(33), s.CreatedDateTime, 127) AS CreatedAt,
            CONVERT(varchar(10), s.Date, 23) AS ApptDate,
            CONVERT(varchar(8), s.StartTime, 108) AS ApptTime
        FROM dbo.AppointmentSchedules s
        LEFT JOIN dbo.Appointments a ON a.Id = s.AppointmentId
        LEFT JOIN dbo.CheckInsHeader ch ON ch.Id = s.CheckInId
        LEFT JOIN dbo.VisitTypes vt ON vt.Id = COALESCE(a.VisitTypeId, ch.VisitTypeId)
        WHERE (s.IsDeleted = 0 OR s.IsDeleted IS NULL)
          AND s.CreatedDateTime >= DATEADD(day, ?, SYSUTCDATETIME())
          AND COALESCE(a.PatientId, ch.PatientId) = ?
        ORDER BY s.CreatedDateTime DESC, s.Id DESC
    """
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(sql, (limit, -int(lookback_days), int(patient_id)))
        columns = [col[0] for col in cursor.description]
        rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

    items: list[PatientNotificationItem] = []
    for row in rows:
        visit = (
            (row.get("VisitTypeDescription") or "").strip()
            or (row.get("VisitTypeCode") or "").strip()
            or "appointment"
        )
        when = _format_appt_when(row.get("ApptDate"), row.get("ApptTime"))
        message = "Appointment confirmed"
        if when:
            message = f"{message} ({visit}, {when})"
        else:
            message = f"{message} ({visit})"

        created_at = _normalize_created_at(row.get("CreatedAt"))
        items.append(
            PatientNotificationItem(
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
    patient_id: int,
    *,
    limit: int,
    lookback_days: int = LOOKBACK_DAYS,
) -> list[PatientNotificationItem]:
    sql = """
        SELECT TOP (?)
            ws.Id AS WorkStatusId,
            CONVERT(varchar(33), ws.CreatedDateTime, 127) AS CreatedAt
        FROM dbo.EHRWorkStatuses ws
        INNER JOIN dbo.CheckInsHeader ch ON ch.Id = ws.CheckInId
        WHERE (ws.IsDeleted = 0 OR ws.IsDeleted IS NULL)
          AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
          AND ch.PatientId = ?
          AND ws.CreatedDateTime >= DATEADD(day, ?, SYSUTCDATETIME())
        ORDER BY ws.CreatedDateTime DESC, ws.Id DESC
    """
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            sql,
            (limit, int(patient_id), -int(lookback_days)),
        )
        columns = [col[0] for col in cursor.description]
        rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

    items: list[PatientNotificationItem] = []
    for row in rows:
        created_at = _normalize_created_at(row.get("CreatedAt"))
        items.append(
            PatientNotificationItem(
                id=f"ws-{int(row['WorkStatusId'])}",
                message="Visit status updated",
                created_at=created_at,
                time_ago=_time_ago(created_at),
                unread=_is_recently_created(created_at, UNREAD_HEURISTIC_DAYS),
                href=None,
                source="work_status",
                source_id=int(row["WorkStatusId"]),
            )
        )
    return items


def _normalize_created_at(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
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
        return f"{minutes} min ago"
    hours = minutes // 60
    if hours < 24:
        return f"{hours} hr ago" if hours == 1 else f"{hours} hrs ago"
    days = hours // 24
    if days == 1:
        return "Yesterday"
    if days < 7:
        return f"{days} days ago"
    return parsed.astimezone(timezone.utc).strftime("%b %d, %Y")


def _format_appt_when(date_value: Any, time_value: Any) -> str | None:
    date_text = (str(date_value).strip() if date_value is not None else "") or ""
    time_text = (str(time_value).strip() if time_value is not None else "") or ""
    if date_text and time_text:
        return f"{date_text} {time_text[:5]}"
    return date_text or time_text or None
