from __future__ import annotations

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.db.clinic import get_clinic_by_activation_key
from app.insurance.profile import fetch_profile_from_clinic, update_profile_in_clinic
from app.insurance.schemas import InsuranceProfileResponse, InsuranceProfileUpdateRequest


def get_insurance_profile(current_user: CurrentUser) -> InsuranceProfileResponse:
    clinic = _require_clinic(current_user)
    profile = fetch_profile_from_clinic(clinic, current_user)
    return _to_response(profile)


def update_insurance_profile(
    current_user: CurrentUser,
    payload: InsuranceProfileUpdateRequest,
) -> InsuranceProfileResponse:
    clinic = _require_clinic(current_user)
    profile = update_profile_in_clinic(
        clinic,
        current_user,
        first_name=payload.first_name,
        last_name=payload.last_name,
        title=payload.title,
        email=payload.email,
        phone=payload.phone,
    )
    return _to_response(profile)


def _require_clinic(current_user: CurrentUser):
    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )
    return clinic


def _to_response(profile) -> InsuranceProfileResponse:
    return InsuranceProfileResponse(
        user_id=profile.user_id,
        insurance_id=profile.insurance_id,
        insurance_contact_id=profile.insurance_contact_id,
        full_name=profile.full_name,
        first_name=profile.first_name,
        last_name=profile.last_name,
        title=profile.title,
        email=profile.email,
        phone=profile.phone,
        organization=profile.organization,
        address=profile.address,
        login_id=profile.login_id,
        type_id=profile.type_id,
        type_label=profile.type_label,
    )
