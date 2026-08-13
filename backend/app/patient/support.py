"""Patient portal Support — thin wrapper over shared MailInboxes messaging."""

from __future__ import annotations

from fastapi import HTTPException, UploadFile, status

from app.auth.dependencies import CurrentUser
from app.db.clinic import get_clinic_by_activation_key
from app.employer.schemas import (
    SupportClinicInfoResponse,
    SupportMessageDetail,
    SupportMessagesResponse,
    SupportRecipientsResponse,
    SupportSendResponse,
)
from app.patient.profile import fetch_profile_from_clinic
from app.support.messaging import SupportActor
from app.support.messaging import (
    get_support_clinic_info as _get_support_clinic_info,
)
from app.support.messaging import (
    get_support_message as _get_support_message,
)
from app.support.messaging import (
    list_support_messages as _list_support_messages,
)
from app.support.messaging import (
    list_support_recipients as _list_support_recipients,
)
from app.support.messaging import (
    send_support_message as _send_support_message,
)


def _resolve(current_user: CurrentUser):
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
            detail="Patient record not found for this user.",
        )
    actor = SupportActor(
        user_id=profile.user_id,
        full_name=profile.full_name,
        email=profile.email,
        login_id=profile.login_id,
        organization=None,
        patient_id=profile.patient_id,
    )
    return clinic, actor


def get_support_clinic_info(current_user: CurrentUser) -> SupportClinicInfoResponse:
    return _get_support_clinic_info(current_user, resolve=_resolve)


def list_support_recipients(
    current_user: CurrentUser,
    *,
    search: str | None = None,
) -> SupportRecipientsResponse:
    return _list_support_recipients(current_user, resolve=_resolve, search=search)


def list_support_messages(
    current_user: CurrentUser,
    *,
    page: int = 1,
    page_size: int = 10,
) -> SupportMessagesResponse:
    return _list_support_messages(
        current_user, resolve=_resolve, page=page, page_size=page_size
    )


def get_support_message(
    current_user: CurrentUser,
    message_id: str,
) -> SupportMessageDetail:
    return _get_support_message(current_user, message_id, resolve=_resolve)


async def send_support_message(
    current_user: CurrentUser,
    *,
    to_user_id: int,
    cc_user_ids: list[int],
    subject: str,
    body: str,
    files: list[UploadFile] | None = None,
) -> SupportSendResponse:
    return await _send_support_message(
        current_user,
        resolve=_resolve,
        to_user_id=to_user_id,
        cc_user_ids=cc_user_ids,
        subject=subject,
        body=body,
        files=files,
    )
