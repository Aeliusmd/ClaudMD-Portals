from __future__ import annotations

from fastapi import HTTPException, status

from app.auth.identity import (
    claims_to_user_fields,
    decode_access_token_claims,
    request_password_token,
)
from app.auth.schemas import ClinicInfo, LoginRequest, LoginResponse, UserInfo
from app.config import get_settings
from app.db.clinic import ClinicConnectionInfo, get_clinic_by_activation_key


def resolve_clinic(activation_key: str) -> ClinicConnectionInfo:
    """Optional read-only clinic metadata from master DB (SELECT only)."""
    settings = get_settings()
    if not settings.master_db_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Master database is not configured.",
        )

    clinic = get_clinic_by_activation_key(activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid activation key. Clinic was not found.",
        )
    if not clinic.active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This clinic is inactive.",
        )
    return clinic


def authenticate_user(payload: LoginRequest) -> LoginResponse:
    """
    Authenticate via ClaudMD IdentityServer password grant.
    No clinic/user password reads and no DB writes.
    """
    settings = get_settings()
    activation_key = (payload.activation_key or settings.default_activation_key).strip()
    if not activation_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Activation key is required.",
        )

    token_payload = request_password_token(
        username=payload.username,
        password=payload.password,
        activation_key=activation_key,
    )

    access_token = token_payload["access_token"]
    claims = decode_access_token_claims(access_token)
    user_fields = claims_to_user_fields(claims, payload.username.strip())
    key_from_token = user_fields.get("activation_key") or activation_key

    clinic_info = _try_clinic_info(key_from_token)

    return LoginResponse(
        access_token=access_token,
        refresh_token=token_payload.get("refresh_token"),
        expires_in=token_payload.get("expires_in"),
        token_type=token_payload.get("token_type") or "Bearer",
        scope=token_payload.get("scope"),
        user=UserInfo(
            id=user_fields.get("id"),
            login_id=user_fields["login_id"],
            email=user_fields.get("email"),
            first_name=user_fields.get("first_name"),
            last_name=user_fields.get("last_name"),
            name=user_fields.get("name"),
            portal="employer",
            activation_key=key_from_token,
        ),
        clinic=clinic_info,
    )


def _try_clinic_info(activation_key: str) -> ClinicInfo | None:
    """Best-effort read-only clinic lookup. Login still succeeds if this fails."""
    settings = get_settings()
    if not settings.master_db_configured:
        return ClinicInfo(activation_key=activation_key)

    try:
        clinic = get_clinic_by_activation_key(activation_key)
    except Exception:
        return ClinicInfo(activation_key=activation_key)

    if not clinic:
        return ClinicInfo(activation_key=activation_key)

    return ClinicInfo(
        id=clinic.clinic_id,
        name=clinic.clinic_name,
        activation_key=clinic.activation_key,
        database_name=clinic.database_name,
        active=clinic.active,
    )
