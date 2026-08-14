from __future__ import annotations

from fastapi import HTTPException, status

from app.auth.identity import (
    claims_to_user_fields,
    decode_access_token_claims,
    request_password_token,
)
from app.auth.password_hasher import hash_password
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
    can_access_portal,
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

    Clinic DB is selected from the login activation key (URL / request body),
    not from a possibly stale ActivationKey claim in the Identity token.
    """
    activation_key = (payload.activation_key or "").strip()
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
    # URL / request key wins for clinic DB selection.
    clinic = _try_resolve_clinic(activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid activation key. Clinic was not found.",
        )
    profile = _fetch_user_profile_type(
        clinic=clinic,
        user_id=user_fields.get("id"),
        login_id=user_fields["login_id"],
        email=user_fields.get("email") or user_fields["login_id"],
        requested_portal=payload.portal,
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
                    "This account is not enabled for a ClaudMD portal. "
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
            activation_key=activation_key,
            must_change_password=bool((profile or {}).get("must_change_password")),
        ),
        clinic=_clinic_info(clinic, activation_key),
    )


def _identity_usernames(*values: str | None) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for raw in values:
        value = (raw or "").strip()
        if not value:
            continue
        key = value.lower()
        if key in seen:
            continue
        seen.add(key)
        ordered.append(value)
    return ordered


def _confirm_identity_password(
    *,
    usernames: list[str],
    password: str,
    activation_key: str,
    invalid_message: str,
) -> str:
    """Return the username IdentityServer accepted for this password."""
    last_error: HTTPException | None = None
    for username in usernames:
        try:
            request_password_token(
                username=username,
                password=password,
                activation_key=activation_key,
            )
            return username
        except HTTPException as exc:
            last_error = exc
            if exc.status_code in {
                status.HTTP_401_UNAUTHORIZED,
                status.HTTP_400_BAD_REQUEST,
            }:
                continue
            raise
    if last_error and last_error.status_code not in {
        status.HTTP_401_UNAUTHORIZED,
        status.HTTP_400_BAD_REQUEST,
    }:
        raise last_error
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=invalid_message,
    )


def change_password(
    current_user: CurrentUser,
    payload: ChangePasswordRequest,
) -> ChangePasswordResponse:
    """
    Same flow as Profile → Security on employer / patient / insurance:

    1) Confirm current password with IdentityServer password grant.
    2) Write ASP.NET Identity V3 hash to UserProfiles.Password.
    3) Set IsPasswordChanged = 1.
    4) Confirm the new password with IdentityServer before returning success.
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
            SELECT TOP 1 Id, LoginId, Email, Password
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
        profile_login_id = (row.LoginId or "").strip() or None
        profile_email = (row.Email or "").strip() or None

    identity_username = _confirm_identity_password(
        usernames=_identity_usernames(
            login_id,
            current_user.email,
            profile_login_id,
            profile_email,
        ),
        password=current_password,
        activation_key=activation_key,
        invalid_message="Current password is incorrect.",
    )

    new_hash = hash_password(new_password)
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
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

    try:
        _confirm_identity_password(
            usernames=[identity_username],
            password=new_password,
            activation_key=activation_key,
            invalid_message="IdentityServer rejected the new password.",
        )
    except HTTPException as exc:
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
        if exc.status_code == status.HTTP_400_BAD_REQUEST:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    "Password was written locally but IdentityServer still rejects the "
                    "new password. Previous password was restored. Contact support."
                ),
            ) from exc
        raise

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


_PORTAL_PREFERRED_TYPE: dict[str, UserType] = {
    "employer": UserType.EmployerUser,
    "patient": UserType.PatientUser,
    "insurance": UserType.InsuranceUser,
    "outsider": UserType.ExternalUser,
}


def _fetch_user_profile_type(
    *,
    clinic: ClinicConnectionInfo | None,
    user_id: int | None,
    login_id: str,
    email: str,
    requested_portal: str | None = None,
) -> dict | None:
    """Read-only UserProfiles lookup for TypeId, UserGroupId + basic identity fields."""
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Clinic database is not available to verify portal access.",
        )

    portal = (requested_portal or "").strip().lower() or None
    preferred_type_id = (
        int(_PORTAL_PREFERRED_TYPE[portal])
        if portal in _PORTAL_PREFERRED_TYPE
        else None
    )

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        row = None

        if user_id is not None:
            cursor.execute(
                """
                SELECT TOP 1
                    Id, LoginId, Email, FirstName, LastName, TypeId, UserGroupId, IsPasswordChanged
                FROM dbo.UserProfiles
                WHERE Id = ?
                  AND (IsDeleted = 0 OR IsDeleted IS NULL)
                  AND RecordStatusId = 1
                """,
                (int(user_id),),
            )
            row = cursor.fetchone()
            if row is not None and portal:
                type_id = None
                if row.TypeId is not None:
                    try:
                        type_id = int(row.TypeId)
                    except (TypeError, ValueError):
                        type_id = None
                if not can_access_portal(type_id, portal):
                    row = None

        if not row:
            if preferred_type_id is not None:
                cursor.execute(
                    """
                    SELECT TOP 1
                        Id, LoginId, Email, FirstName, LastName, TypeId, UserGroupId, IsPasswordChanged
                    FROM dbo.UserProfiles
                    WHERE (IsDeleted = 0 OR IsDeleted IS NULL)
                      AND RecordStatusId = 1
                      AND (
                            LOWER(LTRIM(RTRIM(LoginId))) = LOWER(?)
                         OR LOWER(LTRIM(RTRIM(Email))) = LOWER(?)
                      )
                    ORDER BY
                        CASE WHEN TypeId = ? THEN 0 ELSE 1 END,
                        Id DESC
                    """,
                    (
                        login_id.strip(),
                        (email or login_id).strip(),
                        preferred_type_id,
                    ),
                )
            else:
                cursor.execute(
                    """
                    SELECT TOP 1
                        Id, LoginId, Email, FirstName, LastName, TypeId, UserGroupId, IsPasswordChanged
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

    changed = getattr(row, "IsPasswordChanged", None)
    must_change = changed is None or not bool(changed)

    return {
        "id": int(row.Id),
        "login_id": (row.LoginId or "").strip() or login_id,
        "email": (row.Email or "").strip() or None,
        "first_name": (row.FirstName or "").strip() or None,
        "last_name": (row.LastName or "").strip() or None,
        "type_id": type_id,
        "user_group_id": user_group_id,
        "must_change_password": must_change,
    }
