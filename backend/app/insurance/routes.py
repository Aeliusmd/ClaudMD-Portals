from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.auth.dependencies import CurrentUser, get_current_user
from app.insurance.notifications import (
    DEFAULT_PAGE_SIZE as NOTIF_DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE as NOTIF_MAX_PAGE_SIZE,
    list_notifications,
    mark_notifications_read,
)
from app.insurance.permissions import get_organization_users
from app.insurance.schemas import (
    InsuranceMarkNotificationsReadResponse,
    InsuranceNotificationsResponse,
    InsuranceOrganizationUsersResponse,
    InsuranceProfileResponse,
    InsuranceProfileUpdateRequest,
)
from app.insurance.service import get_insurance_profile, update_insurance_profile

router = APIRouter(prefix="/api/insurance", tags=["insurance"])


@router.get("/me", response_model=InsuranceProfileResponse)
def insurance_profile_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Logged-in Insurance User profile (UserProfiles + InsuranceContacts)."""
    return get_insurance_profile(current_user)


@router.patch("/me", response_model=InsuranceProfileResponse)
def insurance_profile_update_endpoint(
    payload: InsuranceProfileUpdateRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """
    Update editable profile fields on UserProfiles + InsuranceContacts.
    LoginId / TypeId / organization / address are not changed.
    """
    return update_insurance_profile(current_user, payload)


@router.get(
    "/organization-users",
    response_model=InsuranceOrganizationUsersResponse,
)
def insurance_organization_users_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """
    Insurance organization contacts for the Permissions tab (read-only).
    Source: dbo.InsuranceContacts for the logged-in user's InsuranceId.
    """
    return get_organization_users(current_user)


@router.get("/notifications", response_model=InsuranceNotificationsResponse)
def insurance_notifications_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(
        default=NOTIF_DEFAULT_PAGE_SIZE,
        ge=1,
        le=NOTIF_MAX_PAGE_SIZE,
        alias="pageSize",
    ),
):
    """
    In-app notification feed (SELECT only) for the last 30 days, paginated.
    Sources: SharedDocuments, appointments, EHRWorkStatuses for this insurance.
    """
    return list_notifications(current_user, page=page, page_size=page_size)


@router.post(
    "/notifications/mark-read",
    response_model=InsuranceMarkNotificationsReadResponse,
)
def insurance_notifications_mark_read_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Mark SharedDocuments.IsViewed = 1 for shares addressed to this user."""
    return mark_notifications_read(current_user)
