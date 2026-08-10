from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.auth.dependencies import CurrentUser, get_current_user
from app.patient.notifications import (
    DEFAULT_PAGE_SIZE as NOTIF_DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE as NOTIF_MAX_PAGE_SIZE,
    list_notifications,
    mark_notifications_read,
)
from app.patient.schemas import (
    PatientInformationResponse,
    PatientMarkNotificationsReadResponse,
    PatientNotificationsResponse,
    PatientProfileResponse,
    PatientProfileUpdateRequest,
)
from app.patient.service import (
    get_my_information,
    get_patient_profile,
    update_patient_profile,
)

router = APIRouter(prefix="/api/patient", tags=["patient"])


@router.get("/me", response_model=PatientProfileResponse)
def patient_profile_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Logged-in Patient User profile (UserProfiles + Patients via activation-key clinic)."""
    return get_patient_profile(current_user)


@router.patch("/me", response_model=PatientProfileResponse)
def patient_profile_update_endpoint(
    payload: PatientProfileUpdateRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """
    Update editable profile fields on UserProfiles + linked Patients.
    LoginId / TypeId are not changed.
    """
    return update_patient_profile(current_user, payload)


@router.get("/me/information", response_model=PatientInformationResponse)
def patient_my_information_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """
    Read-only My Information: personal, insurance, and employer details.
    Does not write to the clinic database.
    """
    return get_my_information(current_user)


@router.get("/notifications", response_model=PatientNotificationsResponse)
def patient_notifications_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    page: Annotated[int, Query(ge=1)] = 1,
    pageSize: Annotated[int, Query(ge=1, le=NOTIF_MAX_PAGE_SIZE)] = NOTIF_DEFAULT_PAGE_SIZE,
):
    """
    Patient notification feed (shared docs, appointments, visit/work status)
    for the linked patient chart over the last 30 days.
    """
    return list_notifications(current_user, page=page, page_size=pageSize)


@router.post(
    "/notifications/mark-read",
    response_model=PatientMarkNotificationsReadResponse,
)
def patient_notifications_mark_read_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Mark shared documents addressed to this patient user as viewed."""
    return mark_notifications_read(current_user)
