from __future__ import annotations

from fastapi import HTTPException, status

from app.auth.identity import (
    claims_to_user_fields,
    decode_access_token_claims,
    request_password_token,
)
from app.auth.schemas import ClinicInfo, LoginRequest, LoginResponse, UserInfo
from app.auth.user_profile_type import UserType, portal_for_type_id, user_type_label
from app.config import get_settings
from app.db.clinic import ClinicConnectionInfo, get_clinic_by_activation_key, get_clinic_connection


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
    Then resolve UserProfiles.TypeId (SELECT only) to choose employer/patient portal.
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

    clinic = _try_resolve_clinic(key_from_token)
    profile = _fetch_user_profile_type(
        clinic=clinic,
        user_id=user_fields.get("id"),
        login_id=user_fields["login_id"],
        email=user_fields.get("email") or user_fields["login_id"],
    )

    type_id = profile.get("type_id") if profile else None
    portal = portal_for_type_id(type_id)
    if portal is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "This account is not enabled for the employer or patient portal. "
                "Contact your clinic administrator."
            ),
        )

    expected = (payload.portal or "").strip().lower() or None
    if expected in {"employer", "patient"} and expected != portal:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"This account belongs to the {portal} portal. "
                f"Please sign in using the {portal} portal login."
            ),
        )

    # Prefer clinic profile names when available.
    first_name = (profile or {}).get("first_name") or user_fields.get("first_name")
    last_name = (profile or {}).get("last_name") or user_fields.get("last_name")
    email = (profile or {}).get("email") or user_fields.get("email")
    login_id = (profile or {}).get("login_id") or user_fields["login_id"]
    user_id = (profile or {}).get("id") or user_fields.get("id")
    name_parts = [p for p in [first_name, last_name] if p]
    name = " ".join(name_parts) if name_parts else user_fields.get("name")

    return LoginResponse(
        access_token=access_token,
        refresh_token=token_payload.get("refresh_token"),
        expires_in=token_payload.get("expires_in"),
        token_type=token_payload.get("token_type") or "Bearer",
        scope=token_payload.get("scope"),
        user=UserInfo(
            id=user_id,
            login_id=login_id,
            email=email,
            first_name=first_name,
            last_name=last_name,
            name=name,
            portal=portal,
            type_id=type_id,
            type_label=user_type_label(type_id),
            activation_key=key_from_token,
        ),
        clinic=_clinic_info(clinic, key_from_token),
    )


def _try_resolve_clinic(activation_key: str) -> ClinicConnectionInfo | None:
    settings = get_settings()
    if not settings.master_db_configured:
        return None
    try:
        return get_clinic_by_activation_key(activation_key)
    except Exception:
        return None


def _clinic_info(
    clinic: ClinicConnectionInfo | None, activation_key: str
) -> ClinicInfo:
    if not clinic:
        return ClinicInfo(activation_key=activation_key)
    return ClinicInfo(
        id=clinic.clinic_id,
        name=clinic.clinic_name,
        activation_key=clinic.activation_key,
        database_name=clinic.database_name,
        active=clinic.active,
    )


def _fetch_user_profile_type(
    *,
    clinic: ClinicConnectionInfo | None,
    user_id: int | None,
    login_id: str,
    email: str,
) -> dict | None:
    """Read-only UserProfiles lookup for TypeId + basic identity fields."""
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Clinic database is not available to verify portal access.",
        )

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        row = None

        if user_id is not None:
            cursor.execute(
                """
                SELECT TOP 1
                    Id, LoginId, Email, FirstName, LastName, TypeId
                FROM dbo.UserProfiles
                WHERE Id = ?
                  AND (IsDeleted = 0 OR IsDeleted IS NULL)
                  AND RecordStatusId = 1
                """,
                (int(user_id),),
            )
            row = cursor.fetchone()

        if not row:
            cursor.execute(
                """
                SELECT TOP 1
                    Id, LoginId, Email, FirstName, LastName, TypeId
                FROM dbo.UserProfiles
                WHERE (IsDeleted = 0 OR IsDeleted IS NULL)
                  AND RecordStatusId = 1
                  AND (
                        LOWER(LTRIM(RTRIM(LoginId))) = LOWER(?)
                     OR LOWER(LTRIM(RTRIM(Email))) = LOWER(?)
                  )
                ORDER BY
                    CASE WHEN TypeId IN (?, ?) THEN 0 ELSE 1 END,
                    Id DESC
                """,
                (
                    login_id.strip(),
                    (email or login_id).strip(),
                    int(UserType.EmployerUser),
                    int(UserType.PatientUser),
                ),
            )
            row = cursor.fetchone()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No active user profile was found for this account.",
        )

    type_id = None
    if row.TypeId is not None:
        try:
            type_id = int(row.TypeId)
        except (TypeError, ValueError):
            type_id = None

    return {
        "id": int(row.Id),
        "login_id": (row.LoginId or "").strip() or login_id,
        "email": (row.Email or "").strip() or None,
        "first_name": (row.FirstName or "").strip() or None,
        "last_name": (row.LastName or "").strip() or None,
        "type_id": type_id,
    }
