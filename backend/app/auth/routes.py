from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.auth.dependencies import CurrentUser, get_current_user
from app.auth.schemas import (
    ChangePasswordRequest,
    ChangePasswordResponse,
    ClinicResolveResponse,
    LoginRequest,
    LoginResponse,
)
from app.auth.service import authenticate_user, change_password, resolve_clinic
from app.config import get_settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/clinic", response_model=ClinicResolveResponse)
def resolve_clinic_endpoint(
    activation_key: str | None = Query(default=None, alias="activationKey"),
):
    settings = get_settings()
    key = (activation_key or settings.default_activation_key).strip()
    clinic = resolve_clinic(key)
    return ClinicResolveResponse(
        activation_key=clinic.activation_key,
        clinic_id=clinic.clinic_id,
        clinic_name=clinic.clinic_name,
        database_name=clinic.database_name,
        active=clinic.active,
    )


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    return authenticate_user(payload)


@router.post("/change-password", response_model=ChangePasswordResponse)
def change_password_endpoint(
    payload: ChangePasswordRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """
    Profile → Security and first-login change password.
    Verifies current password with IdentityServer, then updates
    UserProfiles.Password / IsPasswordChanged (no new schema).
    """
    return change_password(current_user, payload)
