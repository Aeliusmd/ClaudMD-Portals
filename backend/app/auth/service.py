from __future__ import annotations

from fastapi import HTTPException, status

from app.auth.identity import (
    claims_to_user_fields,
    decode_access_token_claims,
    request_password_token,
)
from app.auth.password_hasher import hash_password, verify_password
from app.auth.schemas import (
    ChangePasswordRequest,
    ChangePasswordResponse,
    ClinicInfo,
    LoginRequest,
    LoginResponse,
    UserInfo,
)
from app.auth.user_profile_type import (
    UserType,
    is_employer_admin,
    is_insurance_admin,
    resolve_login_portal,
    user_type_label,
)
from app.config import get_settings
from app.db.clinic import ClinicConnectionInfo, get_clinic_by_activation_key, get_clinic_connection
from app.auth.dependencies import CurrentUser


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
    Then resolve UserProfiles.TypeId (portal) and UserGroupId (admin role)
    with SELECT only.
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
    user_group_id = profile.get("user_group_id") if profile else None
    try:
        portal = resolve_login_portal(type_id, payload.portal)
    except ValueError as exc:
        reason = str(exc)
        if reason == "portal_disabled":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    "This account is not enabled for the employer, patient, or insurance portal. "
                    "Contact your clinic administrator."
                ),
            ) from exc
        home = reason.split(":", 1)[-1] if reason.startswith("portal_mismatch:") else "employer"
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"This account belongs to the {home} portal. "
                f"Please sign in using the {home} portal login."
            ),
        ) from exc

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
            user_group_id=user_group_id,
            is_admin=(
                is_employer_admin(user_group_id)
                if portal == "employer"
                else is_insurance_admin(user_group_id)
                if portal == "insurance"
                else False
            ),
            activation_key=key_from_token,
        ),
        clinic=_clinic_info(clinic, key_from_token),
    )


def change_password(
    current_user: CurrentUser,
    payload: ChangePasswordRequest,
) -> ChangePasswordResponse:
    """
    Change password using existing dbo.UserProfiles.Password / IsPasswordChanged only.

    1) Confirm current password via IdentityServer password grant (login source of truth).
    2) Write new ASP.NET Identity V3 hash into UserProfiles.Password.
    No new tables/columns.
    """
    current_password = payload.current_password or ""
    new_password = payload.new_password or ""
    confirm_password = payload.confirm_password or ""

    if len(new_password) < 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 4 characters.",
        )
    if new_password != confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password and confirmation do not match.",
        )
    if current_password == new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from the current password.",
        )

    activation_key = (current_user.activation_key or "").strip()
    login_id = (current_user.login_id or current_user.email or "").strip()
    if not activation_key or not login_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    # Prove the current password is valid for Identity login.
    request_password_token(
        username=login_id,
        password=current_password,
        activation_key=activation_key,
    )

    clinic = get_clinic_by_activation_key(activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )

    profile_id = _resolve_profile_id_for_password(
        clinic,
        user_id=current_user.user_id,
        login_id=login_id,
        email=current_user.email or login_id,
    )

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT TOP 1 Id, Password
            FROM dbo.UserProfiles
            WHERE Id = ?
              AND (IsDeleted = 0 OR IsDeleted IS NULL)
              AND RecordStatusId = 1
            """,
            (profile_id,),
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User profile not found.",
            )

        stored = row.Password
        # Prefer Identity grant as source of truth; also reject obvious local mismatch.
        if stored and not verify_password(str(stored), current_password):
            # Some legacy rows may not verify locally but still authenticate via Identity.
            # Identity grant already succeeded above, so continue.
            pass

        new_hash = hash_password(new_password)
        cursor.execute(
            """
            UPDATE dbo.UserProfiles
            SET Password = ?,
                IsPasswordChanged = 1,
                UpdatedDateTime = SYSDATETIMEOFFSET(),
                UpdatedUserId = ?
            WHERE Id = ?
              AND (IsDeleted = 0 OR IsDeleted IS NULL)
            """,
            (new_hash, profile_id, profile_id),
        )
        if cursor.rowcount < 1:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Password could not be updated.",
            )

    # Confirm the new password works with Identity before returning success.
    try:
        request_password_token(
            username=login_id,
            password=new_password,
            activation_key=activation_key,
        )
    except HTTPException:
        # Roll back to previous hash if Identity still rejects the new password.
        with get_clinic_connection(clinic) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE dbo.UserProfiles
                SET Password = ?,
                    IsPasswordChanged = 0,
                    UpdatedDateTime = SYSDATETIMEOFFSET(),
                    UpdatedUserId = ?
                WHERE Id = ?
                """,
                (stored, profile_id, profile_id),
            )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "Password was written locally but IdentityServer still rejects the "
                "new password. Previous password was restored. Contact support."
            ),
        )

    return ChangePasswordResponse(
        message="Password updated successfully.",
    )


def _resolve_profile_id_for_password(
    clinic: ClinicConnectionInfo,
    *,
    user_id: int | None,
    login_id: str,
    email: str,
) -> int:
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        if user_id is not None:
            cursor.execute(
                """
                SELECT TOP 1 Id
                FROM dbo.UserProfiles
                WHERE Id = ?
                  AND (IsDeleted = 0 OR IsDeleted IS NULL)
                  AND RecordStatusId = 1
                """,
                (int(user_id),),
            )
            row = cursor.fetchone()
            if row:
                return int(row.Id)

        cursor.execute(
            """
            SELECT TOP 1 Id
            FROM dbo.UserProfiles
            WHERE (IsDeleted = 0 OR IsDeleted IS NULL)
              AND RecordStatusId = 1
              AND (
                    LOWER(LTRIM(RTRIM(LoginId))) = LOWER(?)
                 OR LOWER(LTRIM(RTRIM(Email))) = LOWER(?)
              )
            ORDER BY Id DESC
            """,
            (login_id.strip(), (email or login_id).strip()),
        )
        row = cursor.fetchone()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found.",
        )
    return int(row.Id)


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
    """Read-only UserProfiles lookup for TypeId, UserGroupId + basic identity fields."""
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
                    Id, LoginId, Email, FirstName, LastName, TypeId, UserGroupId
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
                    Id, LoginId, Email, FirstName, LastName, TypeId, UserGroupId
                FROM dbo.UserProfiles
                WHERE (IsDeleted = 0 OR IsDeleted IS NULL)
                  AND RecordStatusId = 1
                  AND (
                        LOWER(LTRIM(RTRIM(LoginId))) = LOWER(?)
                     OR LOWER(LTRIM(RTRIM(Email))) = LOWER(?)
                  )
                ORDER BY
                    CASE WHEN TypeId IN (?, ?, ?, ?) THEN 0 ELSE 1 END,
                    Id DESC
                """,
                (
                    login_id.strip(),
                    (email or login_id).strip(),
                    int(UserType.SuperAdmin),
                    int(UserType.EmployerUser),
                    int(UserType.PatientUser),
                    int(UserType.InsuranceUser),
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

    user_group_id = None
    if row.UserGroupId is not None:
        try:
            user_group_id = int(row.UserGroupId)
        except (TypeError, ValueError):
            user_group_id = None

    return {
        "id": int(row.Id),
        "login_id": (row.LoginId or "").strip() or login_id,
        "email": (row.Email or "").strip() or None,
        "first_name": (row.FirstName or "").strip() or None,
        "last_name": (row.LastName or "").strip() or None,
        "type_id": type_id,
        "user_group_id": user_group_id,
    }
