from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.auth.user_profile_type import UserType, user_type_label
from app.db.clinic import get_clinic_connection
from app.validation.contact import email_error, phone_error
from app.validation.text import unsafe_markup_error

_NAME_MAX = 50
_TITLE_MAX = 100

# Super Admin may use employer portal; Employer User is the dedicated role.
_EMPLOYER_PORTAL_TYPES = {int(UserType.SuperAdmin), int(UserType.EmployerUser)}


@dataclass(frozen=True)
class EmployerProfile:
    user_id: int | None
    employer_id: int | None
    employer_contact_id: int | None
    full_name: str
    first_name: str | None
    last_name: str | None
    title: str | None
    email: str | None
    phone: str | None
    organization: str | None
    address: str | None
    login_id: str | None
    type_id: int | None = None
    type_label: str | None = None


def fetch_profile_from_clinic(clinic, current_user: CurrentUser) -> EmployerProfile:
    """Read-only profile: UserProfiles + EmployerContacts + Employers (minimal round-trips)."""
    user_id = current_user.user_id
    login = current_user.login_id.strip()
    email = (current_user.email or login).strip()

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()

        user_row = None
        if user_id is not None:
            cursor.execute(
                """
                SELECT TOP 1
                    Id, LoginId, Email, FirstName, LastName, Title, Phone, CellPhone, TypeId
                FROM dbo.UserProfiles
                WHERE Id = ?
                  AND (IsDeleted = 0 OR IsDeleted IS NULL)
                  AND RecordStatusId = 1
                """,
                (int(user_id),),
            )
            user_row = cursor.fetchone()

        if not user_row and login:
            cursor.execute(
                """
                SELECT TOP 1
                    Id, LoginId, Email, FirstName, LastName, Title, Phone, CellPhone, TypeId
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
                    login,
                    email,
                    int(UserType.SuperAdmin),
                    int(UserType.EmployerUser),
                ),
            )
            user_row = cursor.fetchone()

        if not user_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No active user profile was found for this account.",
            )

        type_id = None
        if user_row.TypeId is not None:
            try:
                type_id = int(user_row.TypeId)
            except (TypeError, ValueError):
                type_id = None

        if type_id not in _EMPLOYER_PORTAL_TYPES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This account is not enabled for the employer portal.",
            )

        resolved_user_id = int(user_row.Id)
        profile_email = (user_row.Email or "").strip() or email or None
        login_id = (user_row.LoginId or "").strip() or login or None
        first_name = (user_row.FirstName or "").strip() or None
        last_name = (user_row.LastName or "").strip() or None
        title = (user_row.Title or "").strip() or None
        phone = (
            (user_row.CellPhone or "").strip()
            or (user_row.Phone or "").strip()
            or None
        )

        # One round-trip for contact + employer (+ address).
        cursor.execute(
            """
            SELECT TOP 1
                ec.Id AS ContactId,
                ec.FirstName,
                ec.LastName,
                ec.Email,
                ec.Phone,
                ec.CellPhone,
                ec.EmployerId,
                ec.UserId,
                COALESCE(pa.EmployerId, ec.EmployerId) AS ResolvedEmployerId,
                emp.Name AS EmployerName,
                emp.Address AS EmployerAddress,
                emp.Address2 AS EmployerAddress2,
                emp.City AS EmployerCity,
                emp.State AS EmployerState,
                emp.ZipCode AS EmployerZipCode
            FROM dbo.EmployerContacts ec
            LEFT JOIN dbo.EmployerContactPortalAccess pa
                ON pa.EmployerContactId = ec.Id
               AND (pa.IsDeleted = 0 OR pa.IsDeleted IS NULL)
            LEFT JOIN dbo.Employers emp
                ON emp.Id = COALESCE(pa.EmployerId, ec.EmployerId)
               AND (emp.IsDeleted = 0 OR emp.IsDeleted IS NULL)
            WHERE (ec.IsDeleted = 0 OR ec.IsDeleted IS NULL)
              AND (
                    (? IS NOT NULL AND ec.UserId = ?)
                 OR LOWER(LTRIM(RTRIM(ec.Email))) = LOWER(?)
              )
            ORDER BY
                CASE WHEN pa.Id IS NOT NULL THEN 0 ELSE 1 END,
                CASE WHEN ec.UserId = ? THEN 0 ELSE 1 END,
                ec.Id
            """,
            (resolved_user_id, resolved_user_id, profile_email or email, resolved_user_id),
        )
        contact_row = cursor.fetchone()

    if contact_row:
        first_name = first_name or ((contact_row.FirstName or "").strip() or None)
        last_name = last_name or ((contact_row.LastName or "").strip() or None)
        profile_email = (contact_row.Email or "").strip() or profile_email
        phone = (
            (contact_row.CellPhone or "").strip()
            or (contact_row.Phone or "").strip()
            or phone
        )

    employer_id = None
    organization = None
    address = None
    if contact_row:
        if contact_row.ResolvedEmployerId is not None:
            employer_id = int(contact_row.ResolvedEmployerId)
        organization = (contact_row.EmployerName or "").strip() or None
        address = _format_employer_address(contact_row)

    full_name = " ".join(
        part for part in [first_name, last_name] if part and str(part).strip()
    ).strip()

    if not full_name and current_user.display_name:
        full_name = current_user.display_name.strip()
    if not full_name:
        full_name = profile_email or login_id or "Employer User"

    occupation = (title or "").strip() or None

    return EmployerProfile(
        user_id=resolved_user_id,
        employer_id=employer_id,
        employer_contact_id=int(contact_row.ContactId) if contact_row else None,
        full_name=full_name,
        first_name=(first_name or "").strip() or None,
        last_name=(last_name or "").strip() or None,
        title=occupation,
        email=profile_email,
        phone=(phone or "").strip() or None,
        organization=organization,
        address=address,
        login_id=login_id,
        type_id=type_id,
        type_label=user_type_label(type_id),
    )


def _format_employer_address(row) -> str | None:
    parts = [
        (getattr(row, "EmployerAddress", None) or "").strip(),
        (getattr(row, "EmployerAddress2", None) or "").strip(),
    ]
    city = (getattr(row, "EmployerCity", None) or "").strip()
    state = (getattr(row, "EmployerState", None) or "").strip()
    zip_code = (getattr(row, "EmployerZipCode", None) or "").strip()
    city_line = " ".join(part for part in [city, state, zip_code] if part).strip()
    if city and state:
        city_line = f"{city}, {state}"
        if zip_code:
            city_line = f"{city_line} {zip_code}"
    if city_line:
        parts.append(city_line)
    formatted = ", ".join(part for part in parts if part)
    return formatted or None


def update_profile_in_clinic(
    clinic,
    current_user: CurrentUser,
    *,
    first_name: str,
    last_name: str,
    title: str | None,
    email: str,
    phone: str | None,
) -> EmployerProfile:
    """
    Update editable identity fields on UserProfiles + EmployerContacts.
    Does not change LoginId, TypeId, organization, or employer address.
    Does not write notifications or AuditLogEntries.
    """
    first = (first_name or "").strip()
    last = (last_name or "").strip()
    title_norm = (title or "").strip() or None
    email_norm = (email or "").strip()
    phone_norm = (phone or "").strip() or None

    errors = _validate_profile_fields(
        first_name=first,
        last_name=last,
        title=title_norm,
        email=email_norm,
        phone=phone_norm,
    )
    if errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Validation failed.", "errors": errors},
        )

    current = fetch_profile_from_clinic(clinic, current_user)
    if current.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found.",
        )

    actor_id = int(current.user_id)

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE dbo.UserProfiles
            SET FirstName = ?,
                LastName = ?,
                Title = ?,
                Email = ?,
                Phone = ?,
                CellPhone = ?,
                UpdatedDateTime = SYSUTCDATETIME(),
                UpdatedUserId = ?
            WHERE Id = ?
              AND (IsDeleted = 0 OR IsDeleted IS NULL)
              AND RecordStatusId = 1
            """,
            (
                first,
                last or None,
                title_norm,
                email_norm,
                phone_norm,
                phone_norm,
                actor_id,
                actor_id,
            ),
        )
        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User profile not found.",
            )

        if current.employer_contact_id is not None:
            cursor.execute(
                """
                UPDATE dbo.EmployerContacts
                SET FirstName = ?,
                    LastName = ?,
                    Email = ?,
                    Phone = ?,
                    CellPhone = ?,
                    UpdatedDateTime = SYSUTCDATETIME(),
                    UpdatedUserId = ?
                WHERE Id = ?
                  AND (IsDeleted = 0 OR IsDeleted IS NULL)
                """,
                (
                    first,
                    last or None,
                    email_norm,
                    phone_norm,
                    phone_norm,
                    actor_id,
                    int(current.employer_contact_id),
                ),
            )

    # Re-read after update (login_id / org unchanged).
    return fetch_profile_from_clinic(clinic, current_user)


def _validate_profile_fields(
    *,
    first_name: str,
    last_name: str,
    title: str | None,
    email: str,
    phone: str | None,
) -> dict[str, str]:
    errors: dict[str, str] = {}

    if not first_name:
        errors["first_name"] = "First name is required."
    elif len(first_name) > _NAME_MAX:
        errors["first_name"] = f"First name must be at most {_NAME_MAX} characters."
    else:
        err = unsafe_markup_error(first_name)
        if err:
            errors["first_name"] = err

    if len(last_name) > _NAME_MAX:
        errors["last_name"] = f"Last name must be at most {_NAME_MAX} characters."
    elif last_name:
        err = unsafe_markup_error(last_name)
        if err:
            errors["last_name"] = err

    if title and len(title) > _TITLE_MAX:
        errors["title"] = f"Title must be at most {_TITLE_MAX} characters."
    elif title:
        err = unsafe_markup_error(title)
        if err:
            errors["title"] = err

    err = email_error(email, required=True)
    if err:
        errors["email"] = err

    err = phone_error(phone, required=False)
    if err:
        errors["phone"] = err

    return errors
