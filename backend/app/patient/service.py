"""Patient portal profile service."""

from __future__ import annotations

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.db.clinic import get_clinic_by_activation_key
from app.patient.information import get_patient_information
from app.patient.profile import fetch_profile_from_clinic, update_profile_in_clinic
from app.patient.schemas import (
    PatientInformationResponse,
    PatientProfileResponse,
    PatientProfileUpdateRequest,
)


def get_patient_profile(current_user: CurrentUser) -> PatientProfileResponse:
    clinic = _require_clinic(current_user)
    profile = fetch_profile_from_clinic(clinic, current_user)
    return _to_response(profile)


def update_patient_profile(
    current_user: CurrentUser,
    payload: PatientProfileUpdateRequest,
) -> PatientProfileResponse:
    clinic = _require_clinic(current_user)
    profile = update_profile_in_clinic(
        clinic,
        current_user,
        full_name=payload.full_name,
        date_of_birth=payload.date_of_birth,
        email=payload.email,
        phone=payload.phone,
        address=payload.address,
    )
    return _to_response(profile)


def get_my_information(current_user: CurrentUser) -> PatientInformationResponse:
    clinic = _require_clinic(current_user)
    return get_patient_information(clinic, current_user)


def _require_clinic(current_user: CurrentUser):
    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )
    return clinic


def _to_response(profile) -> PatientProfileResponse:
    return PatientProfileResponse(
        user_id=profile.user_id,
        patient_id=profile.patient_id,
        full_name=profile.full_name,
        first_name=profile.first_name,
        last_name=profile.last_name,
        date_of_birth=profile.date_of_birth,
        email=profile.email,
        phone=profile.phone,
        address=profile.address,
        login_id=profile.login_id,
        type_id=profile.type_id,
        type_label=profile.type_label,
    )
