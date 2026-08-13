"""
Shared portal Support — internal messaging via dbo.MailInboxes / MailInboxAttachments.

Uses existing clinic tables only (INSERT/UPDATE into MailInboxes + MailInboxAttachments).
No schema changes. No SMTP / external email.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.auth.dependencies import CurrentUser
from app.auth.user_profile_type import UserType
from app.config import BACKEND_ROOT
from app.db.clinic import ClinicConnectionInfo, get_clinic_connection
from app.employer.schemas import (
    SupportAttachmentRow,
    SupportClinicInfoResponse,
    SupportMessageDetail,
    SupportMessageRow,
    SupportMessagesResponse,
    SupportRecipientRow,
    SupportRecipientsResponse,
    SupportSendResponse,
    SupportUserRef,
)
from app.validation.text import unsafe_markup_error

_SUBJECT_MAX = 200
_BODY_MAX = 5000
_ATTACHMENT_MAX_COUNT = 5
_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024
_ALLOWED_ATTACHMENT_EXT = {
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".txt",
    ".csv",
}

# Clinic staff who can be messaged from portal Support.
_CLINIC_STAFF_TYPE_IDS = (int(UserType.SuperAdmin), int(UserType.SystemUser))

_ATTACH_ROOT = BACKEND_ROOT / "data" / "mail_inbox_attachments"


@dataclass(frozen=True)
class SupportActor:
    """Logged-in portal user context for MailInboxes messaging."""

    user_id: int | None
    full_name: str
    email: str | None = None
    login_id: str | None = None
    organization: str | None = None
    employer_id: int | None = None
    insurance_id: int | None = None
    patient_id: int | None = None


SupportResolveFn = Callable[[CurrentUser], tuple[ClinicConnectionInfo, SupportActor]]


def get_support_clinic_info(
    current_user: CurrentUser,
    *,
    resolve: SupportResolveFn,
) -> SupportClinicInfoResponse:
    clinic, actor = resolve(current_user)
    return SupportClinicInfoResponse(
        clinic_name=clinic.clinic_name or "Clinic",
        clinic_email=None,
        location_id=None,
        can_send=actor.user_id is not None,
        smtp_configured=False,
        employer_id=actor.employer_id,
        insurance_id=actor.insurance_id,
        patient_id=actor.patient_id,
        from_email=(actor.email or actor.login_id or "").strip() or None,
        from_name=actor.full_name,
        from_user_id=actor.user_id,
    )


def list_support_recipients(
    current_user: CurrentUser,
    *,
    resolve: SupportResolveFn,
    search: str | None = None,
) -> SupportRecipientsResponse:
    clinic, actor = resolve(current_user)
    if actor.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your user profile could not be resolved for messaging.",
        )

    needle = (search or "").strip().lower()
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                up.Id,
                up.FirstName,
                up.LastName,
                up.Title,
                up.Email,
                up.LoginId,
                up.TypeId
            FROM dbo.UserProfiles up
            WHERE (up.IsDeleted = 0 OR up.IsDeleted IS NULL)
              AND up.RecordStatusId = 1
              AND up.TypeId IN (?, ?)
              AND up.Id <> ?
            ORDER BY up.LastName, up.FirstName, up.Id
            """,
            (*_CLINIC_STAFF_TYPE_IDS, int(actor.user_id)),
        )
        rows = cursor.fetchall()

    items: list[SupportRecipientRow] = []
    for row in rows:
        first = (row.FirstName or "").strip()
        last = (row.LastName or "").strip()
        full_name = " ".join(part for part in [first, last] if part).strip()
        email = (row.Email or "").strip() or None
        login_id = (row.LoginId or "").strip() or None
        title = (row.Title or "").strip() or None
        if not full_name:
            full_name = email or login_id or f"User {int(row.Id)}"
        display_label = email or full_name
        occupation = title

        if needle:
            hay = " ".join(
                part
                for part in [full_name, email or "", login_id or "", occupation or ""]
                if part
            ).lower()
            if needle not in hay:
                continue

        items.append(
            SupportRecipientRow(
                user_id=int(row.Id),
                full_name=full_name,
                email=email,
                login_id=login_id,
                occupation=occupation,
                display_label=display_label,
                type_id=int(row.TypeId) if row.TypeId is not None else None,
            )
        )

    return SupportRecipientsResponse(
        items=items,
        total=len(items),
        clinic_name=clinic.clinic_name or "Clinic",
    )


def list_support_messages(
    current_user: CurrentUser,
    *,
    resolve: SupportResolveFn,
    page: int = 1,
    page_size: int = 10,
) -> SupportMessagesResponse:
    clinic, actor = resolve(current_user)
    if actor.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your user profile could not be resolved for messaging.",
        )

    page = max(1, int(page or 1))
    page_size = min(50, max(1, int(page_size or 10)))
    user_id = int(actor.user_id)

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                mi.Id,
                mi.FromMailUserId,
                mi.ToMailUserId,
                mi.CCMailUserId,
                mi.Subject,
                mi.Body,
                mi.IsSeen,
                CONVERT(varchar(33), mi.SentDateTime, 127) AS SentDateTime,
                CONVERT(varchar(33), mi.CreatedDateTime, 127) AS CreatedDateTime,
                from_up.FirstName AS FromFirstName,
                from_up.LastName AS FromLastName,
                from_up.Email AS FromEmail,
                from_up.LoginId AS FromLoginId,
                to_up.FirstName AS ToFirstName,
                to_up.LastName AS ToLastName,
                to_up.Email AS ToEmail,
                to_up.LoginId AS ToLoginId
            FROM dbo.MailInboxes mi
            LEFT JOIN dbo.UserProfiles from_up
                ON from_up.Id = mi.FromMailUserId
            LEFT JOIN dbo.UserProfiles to_up
                ON to_up.Id = mi.ToMailUserId
            WHERE (mi.IsDeleted = 0 OR mi.IsDeleted IS NULL)
              AND (
                    mi.FromMailUserId = ?
                 OR mi.ToMailUserId = ?
              )
            ORDER BY mi.SentDateTime DESC, mi.Id DESC
            """,
            (user_id, user_id),
        )
        rows = cursor.fetchall()

    # Collapse mother-style CC duplicates (same From/Subject/Body/Sent time).
    grouped: list[dict] = []
    index_by_key: dict[tuple, int] = {}
    for row in rows:
        key = (
            int(row.FromMailUserId),
            (row.Subject or "").strip(),
            (row.Body or "").strip(),
            (row.SentDateTime or "").strip(),
        )
        to_ref = _user_ref(
            user_id=int(row.ToMailUserId),
            first=row.ToFirstName,
            last=row.ToLastName,
            email=row.ToEmail,
            login_id=row.ToLoginId,
        )
        is_received_for_me = int(row.ToMailUserId) == user_id
        if key not in index_by_key:
            index_by_key[key] = len(grouped)
            grouped.append(
                {
                    "id": int(row.Id),
                    "from_user_id": int(row.FromMailUserId),
                    "from_ref": _user_ref(
                        user_id=int(row.FromMailUserId),
                        first=row.FromFirstName,
                        last=row.FromLastName,
                        email=row.FromEmail,
                        login_id=row.FromLoginId,
                    ),
                    "to_refs": [to_ref],
                    "subject": (row.Subject or "").strip(),
                    "body": row.Body or "",
                    # Unread applies to received rows for this user.
                    "is_seen": (
                        True
                        if int(row.FromMailUserId) == user_id
                        else (bool(row.IsSeen) if is_received_for_me else True)
                    ),
                    "created_at": row.SentDateTime or row.CreatedDateTime,
                    "direction": (
                        "sent"
                        if int(row.FromMailUserId) == user_id
                        else "received"
                    ),
                    "member_ids": {int(row.Id)},
                    "my_inbox_id": int(row.Id) if is_received_for_me else None,
                }
            )
        else:
            item = grouped[index_by_key[key]]
            item["member_ids"].add(int(row.Id))
            if not any(r.user_id == to_ref.user_id for r in item["to_refs"]):
                item["to_refs"].append(to_ref)
            if is_received_for_me:
                item["my_inbox_id"] = int(row.Id)
                item["is_seen"] = bool(row.IsSeen)
                item["id"] = int(row.Id)
                item["direction"] = "received"
            elif item.get("my_inbox_id") is None and int(row.Id) < int(item["id"]):
                # Prefer lowest id as canonical (primary To row usually first).
                item["id"] = int(row.Id)

    total = len(grouped)
    total_pages = max(1, (total + page_size - 1) // page_size) if total else 1
    if total and page > total_pages:
        page = total_pages
    start = (page - 1) * page_size
    page_items = grouped[start : start + page_size]

    return SupportMessagesResponse(
        items=[_to_row(item) for item in page_items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages if total else 1,
        clinic_name=clinic.clinic_name or "Clinic",
        clinic_email=None,
    )


def get_support_message(
    current_user: CurrentUser,
    message_id: str,
    *,
    resolve: SupportResolveFn,
) -> SupportMessageDetail:
    clinic, actor = resolve(current_user)
    if actor.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your user profile could not be resolved for messaging.",
        )
    try:
        mail_id = int(str(message_id).strip())
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Support message not found.",
        ) from exc

    user_id = int(actor.user_id)
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT TOP 1
                mi.Id,
                mi.FromMailUserId,
                mi.ToMailUserId,
                mi.CCMailUserId,
                mi.Subject,
                mi.Body,
                mi.IsSeen,
                CONVERT(varchar(33), mi.SentDateTime, 127) AS SentDateTime,
                CONVERT(varchar(33), mi.CreatedDateTime, 127) AS CreatedDateTime
            FROM dbo.MailInboxes mi
            WHERE mi.Id = ?
              AND (mi.IsDeleted = 0 OR mi.IsDeleted IS NULL)
              AND (
                    mi.FromMailUserId = ?
                 OR mi.ToMailUserId = ?
              )
            """,
            (mail_id, user_id, user_id),
        )
        anchor = cursor.fetchone()
        if not anchor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Support message not found.",
            )

        # Mark as seen when the logged-in user opens a message addressed to them.
        is_seen = bool(anchor.IsSeen)
        if int(anchor.ToMailUserId) == user_id and not is_seen:
            cursor.execute(
                """
                UPDATE dbo.MailInboxes
                SET IsSeen = 1,
                    UpdatedDateTime = SYSDATETIMEOFFSET(),
                    UpdatedUserId = ?
                WHERE Id = ?
                  AND ToMailUserId = ?
                  AND (IsDeleted = 0 OR IsDeleted IS NULL)
                  AND (IsSeen = 0 OR IsSeen IS NULL)
                """,
                (user_id, int(anchor.Id), user_id),
            )
            is_seen = True

        cursor.execute(
            """
            SELECT
                mi.Id,
                mi.ToMailUserId,
                mi.CCMailUserId,
                to_up.FirstName AS ToFirstName,
                to_up.LastName AS ToLastName,
                to_up.Email AS ToEmail,
                to_up.LoginId AS ToLoginId,
                from_up.FirstName AS FromFirstName,
                from_up.LastName AS FromLastName,
                from_up.Email AS FromEmail,
                from_up.LoginId AS FromLoginId
            FROM dbo.MailInboxes mi
            LEFT JOIN dbo.UserProfiles to_up ON to_up.Id = mi.ToMailUserId
            LEFT JOIN dbo.UserProfiles from_up ON from_up.Id = mi.FromMailUserId
            WHERE (mi.IsDeleted = 0 OR mi.IsDeleted IS NULL)
              AND mi.FromMailUserId = ?
              AND LTRIM(RTRIM(ISNULL(mi.Subject, ''))) = ?
              AND LTRIM(RTRIM(ISNULL(mi.Body, ''))) = ?
              AND CONVERT(varchar(33), mi.SentDateTime, 127) = ?
            ORDER BY mi.Id
            """,
            (
                int(anchor.FromMailUserId),
                (anchor.Subject or "").strip(),
                (anchor.Body or "").strip(),
                anchor.SentDateTime,
            ),
        )
        siblings = cursor.fetchall()
        member_ids = [int(r.Id) for r in siblings] or [mail_id]

        cursor.execute(
            f"""
            SELECT
                a.Id,
                a.MailInboxId,
                a.FileName,
                a.FilePath
            FROM dbo.MailInboxAttachments a
            WHERE (a.IsDeleted = 0 OR a.IsDeleted IS NULL)
              AND a.MailInboxId IN ({",".join("?" for _ in member_ids)})
            ORDER BY a.Id
            """,
            tuple(member_ids),
        )
        attachment_rows = cursor.fetchall()

    to_refs: list[SupportUserRef] = []
    seen_to: set[int] = set()
    for row in siblings:
        ref = _user_ref(
            user_id=int(row.ToMailUserId),
            first=row.ToFirstName,
            last=row.ToLastName,
            email=row.ToEmail,
            login_id=row.ToLoginId,
        )
        if ref.user_id in seen_to:
            continue
        seen_to.add(ref.user_id)
        to_refs.append(ref)

    from_row = siblings[0] if siblings else None
    from_ref = _user_ref(
        user_id=int(anchor.FromMailUserId),
        first=getattr(from_row, "FromFirstName", None),
        last=getattr(from_row, "FromLastName", None),
        email=getattr(from_row, "FromEmail", None),
        login_id=getattr(from_row, "FromLoginId", None),
    )

    # Primary To = first sibling; remaining are CCs (mother duplicate-row model).
    primary_to = to_refs[0] if to_refs else None
    cc_refs = to_refs[1:] if len(to_refs) > 1 else []

    attachments: list[SupportAttachmentRow] = []
    seen_names: set[str] = set()
    for row in attachment_rows:
        name = (row.FileName or "").strip() or f"file-{int(row.Id)}"
        if name in seen_names:
            continue
        seen_names.add(name)
        attachments.append(
            SupportAttachmentRow(
                id=int(row.Id),
                file_name=name,
                mail_inbox_id=int(row.MailInboxId),
            )
        )

    return SupportMessageDetail(
        id=str(int(anchor.Id)),
        subject=(anchor.Subject or "").strip(),
        body=anchor.Body or "",
        category="internal",
        category_label="Internal",
        to_email=primary_to.email if primary_to else None,
        from_email=from_ref.email,
        from_name=from_ref.full_name,
        clinic_name=clinic.clinic_name or "Clinic",
        organization=actor.organization,
        status="sent" if int(anchor.FromMailUserId) == user_id else "received",
        delivery_note="Saved in clinic MailInboxes (internal message).",
        created_at=anchor.SentDateTime or anchor.CreatedDateTime,
        from_user=from_ref,
        to_user=primary_to,
        cc_users=cc_refs,
        attachments=attachments,
        direction="sent" if int(anchor.FromMailUserId) == user_id else "received",
        is_seen=is_seen if int(anchor.ToMailUserId) == user_id else True,
    )


async def send_support_message(
    current_user: CurrentUser,
    *,
    resolve: SupportResolveFn,
    to_user_id: int,
    cc_user_ids: list[int],
    subject: str,
    body: str,
    files: list[UploadFile] | None = None,
) -> SupportSendResponse:
    clinic, actor = resolve(current_user)
    if actor.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your user profile could not be resolved for messaging.",
        )

    from_user_id = int(actor.user_id)
    try:
        to_user_id = int(to_user_id)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A valid To recipient is required.",
        ) from exc

    normalized_ccs: list[int] = []
    seen_cc: set[int] = set()
    for raw in cc_user_ids or []:
        try:
            cc_id = int(raw)
        except (TypeError, ValueError):
            continue
        if cc_id in seen_cc or cc_id == to_user_id or cc_id == from_user_id:
            continue
        seen_cc.add(cc_id)
        normalized_ccs.append(cc_id)

    subject_clean = (subject or "").strip()
    body_clean = (body or "").strip()
    if not subject_clean:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subject is required.",
        )
    if len(subject_clean) > _SUBJECT_MAX:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Subject must be at most {_SUBJECT_MAX} characters.",
        )
    if not body_clean:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message is required.",
        )
    if len(body_clean) > _BODY_MAX:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Message must be at most {_BODY_MAX} characters.",
        )
    for label, value in (("Subject", subject_clean), ("Message", body_clean)):
        err = unsafe_markup_error(value)
        if err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{label}: {err}",
            )

    recipient_ids = [to_user_id, *normalized_ccs]
    _assert_valid_recipients(clinic, from_user_id, recipient_ids)

    prepared_files = await _prepare_attachments(files or [])

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    # Mother-style CC: one MailInboxes row per recipient (To = that person).
    # Primary row may also store the first CC in CCMailUserId when present.
    primary_cc = normalized_ccs[0] if len(normalized_ccs) == 1 else None
    created_ids: list[int] = []

    with get_clinic_connection(clinic, autocommit=False) as conn:
        cursor = conn.cursor()
        for index, recipient_id in enumerate(recipient_ids):
            cc_value = primary_cc if index == 0 and primary_cc is not None else None
            cursor.execute(
                """
                INSERT INTO dbo.MailInboxes (
                    FromMailUserId,
                    ToMailUserId,
                    CCMailUserId,
                    BCCMailUserId,
                    Subject,
                    Body,
                    SentDateTime,
                    IsSeen,
                    CreatedUserId,
                    CreatedDateTime,
                    UpdatedDateTime,
                    UpdatedUserId,
                    RecordStatusId,
                    IsDeleted
                )
                OUTPUT INSERTED.Id
                VALUES (
                    ?, ?, ?, NULL, ?, ?, ?, 0, ?, SYSDATETIMEOFFSET(),
                    SYSDATETIMEOFFSET(), ?, 1, 0
                )
                """,
                (
                    from_user_id,
                    recipient_id,
                    cc_value,
                    subject_clean,
                    body_clean,
                    now,
                    from_user_id,
                    from_user_id,
                ),
            )
            inserted = cursor.fetchone()
            if not inserted:
                conn.rollback()
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Unable to save internal message.",
                )
            created_ids.append(int(inserted[0]))

        # Persist files once, then attach the same metadata to every mail row.
        saved_meta = _persist_attachment_files(
            clinic.activation_key,
            created_ids[0],
            prepared_files,
        )
        for mail_id in created_ids:
            for meta in saved_meta:
                cursor.execute(
                    """
                    INSERT INTO dbo.MailInboxAttachments (
                        MailInboxId,
                        FileName,
                        FilePath,
                        CreatedUserId,
                        CreatedDateTime,
                        UpdatedDateTime,
                        UpdatedUserId,
                        RecordStatusId,
                        IsDeleted
                    )
                    VALUES (
                        ?, ?, ?, ?, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET(), ?, 1, 0
                    )
                    """,
                    (
                        mail_id,
                        meta["file_name"],
                        meta["file_path"],
                        from_user_id,
                        from_user_id,
                    ),
                )
        conn.commit()

    detail = get_support_message(current_user, str(created_ids[0]), resolve=resolve)
    return SupportSendResponse(
        message=detail,
        delivery_status="sent",
        delivery_note=(
            f"Internal message saved to MailInboxes "
            f"({len(created_ids)} recipient row"
            f"{'' if len(created_ids) == 1 else 's'})."
        ),
    )


def _assert_valid_recipients(clinic, from_user_id: int, recipient_ids: list[int]) -> None:
    if not recipient_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A To recipient is required.",
        )
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        placeholders = ",".join("?" for _ in recipient_ids)
        cursor.execute(
            f"""
            SELECT Id
            FROM dbo.UserProfiles
            WHERE (IsDeleted = 0 OR IsDeleted IS NULL)
              AND RecordStatusId = 1
              AND TypeId IN (?, ?)
              AND Id IN ({placeholders})
            """,
            (*_CLINIC_STAFF_TYPE_IDS, *recipient_ids),
        )
        found = {int(r.Id) for r in cursor.fetchall()}
    missing = [rid for rid in recipient_ids if rid not in found]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="One or more recipients are not valid clinic users.",
        )
    if from_user_id in found and from_user_id in recipient_ids:
        # Already filtered in send, keep as safety.
        pass


async def _prepare_attachments(files: list[UploadFile]) -> list[dict]:
    if len(files) > _ATTACHMENT_MAX_COUNT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"At most {_ATTACHMENT_MAX_COUNT} attachments are allowed.",
        )
    prepared: list[dict] = []
    for upload in files:
        if upload is None:
            continue
        original = (upload.filename or "").strip()
        if not original:
            continue
        safe_name = _safe_filename(original)
        suffix = Path(safe_name).suffix.lower()
        if suffix not in _ALLOWED_ATTACHMENT_EXT:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Attachment type not allowed: {safe_name}",
            )
        content = await upload.read()
        if len(content) > _ATTACHMENT_MAX_BYTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Attachment exceeds 5 MB: {safe_name}",
            )
        if not content:
            continue
        prepared.append({"file_name": safe_name, "content": content})
    return prepared


def _persist_attachment_files(
    activation_key: str,
    mail_inbox_id: int,
    prepared: list[dict],
) -> list[dict]:
    if not prepared:
        return []
    safe_key = re.sub(r"[^A-Za-z0-9_-]+", "_", (activation_key or "clinic").strip()) or "clinic"
    folder = _ATTACH_ROOT / safe_key / str(int(mail_inbox_id))
    folder.mkdir(parents=True, exist_ok=True)
    saved: list[dict] = []
    for item in prepared:
        unique = f"{uuid.uuid4().hex[:10]}_{item['file_name']}"
        path = folder / unique
        path.write_bytes(item["content"])
        saved.append(
            {
                "file_name": item["file_name"],
                "file_path": str(path),
            }
        )
    return saved


def _safe_filename(name: str) -> str:
    cleaned = re.sub(r"[^\w.\- ()]+", "_", name).strip(" ._")
    return (cleaned or "attachment")[:180]


def _user_ref(
    *,
    user_id: int,
    first: str | None,
    last: str | None,
    email: str | None,
    login_id: str | None,
) -> SupportUserRef:
    full_name = " ".join(
        part for part in [(first or "").strip(), (last or "").strip()] if part
    ).strip()
    email_clean = (email or "").strip() or None
    login_clean = (login_id or "").strip() or None
    if not full_name:
        full_name = email_clean or login_clean or f"User {user_id}"
    return SupportUserRef(
        user_id=user_id,
        full_name=full_name,
        email=email_clean,
        display_label=email_clean or full_name,
    )


def _to_row(item: dict) -> SupportMessageRow:
    to_refs: list[SupportUserRef] = item.get("to_refs") or []
    primary = to_refs[0] if to_refs else None
    cc_labels = [r.display_label for r in to_refs[1:]]
    return SupportMessageRow(
        id=str(item["id"]),
        subject=item.get("subject") or "",
        category="internal",
        category_label="Internal",
        to_email=primary.email if primary else None,
        from_email=item["from_ref"].email if item.get("from_ref") else None,
        status=item.get("direction") or "sent",
        created_at=item.get("created_at"),
        preview=_preview(item.get("body")),
        from_user=item.get("from_ref"),
        to_user=primary,
        cc_labels=cc_labels,
        direction=item.get("direction") or "sent",
        is_seen=bool(item.get("is_seen")),
    )


def _preview(body: str | None, limit: int = 120) -> str:
    text = re.sub(r"\s+", " ", (body or "").strip())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"
