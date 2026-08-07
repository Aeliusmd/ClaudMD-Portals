from __future__ import annotations

import re
from dataclasses import dataclass

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.auth.user_profile_type import UserType, user_type_label
from app.db.clinic import get_clinic_connection

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_NAME_MAX = 50
_TITLE_MAX = 100
_EMAIL_MAX = 100
_PHONE_MAX = 20
_PHONE_DIGITS_MIN = 10

_INSURANCE_PORTAL_TYPES = {int(UserType.SuperAdmin), int(UserType.InsuranceUser)}


@dataclass(frozen=True)
class InsuranceProfile:
    user_id: int | None
    insurance_id: int | None
    insurance_contact_id: int | None
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


def fetch_profile_from_clinic(clinic, current_user: CurrentUser) -> InsuranceProfile:
    """Read-only profile: UserProfiles + InsuranceContacts + Insurances."""
    user_id = current_user.user_id
    login = (current_user.login_id or "").strip()
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
                    int(UserType.InsuranceUser),
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

        if type_id not in _INSURANCE_PORTAL_TYPES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This account is not enabled for the insurance portal.",
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

        # InsuranceContacts has no UserId — match by email; require portal access
        # (same as sithum branch) so dashboard counts resolve to a real InsuranceId.
        contact_email = (profile_email or login_id or "").strip()
        cursor.execute(
            """
            SELECT TOP 1
                ic.Id AS ContactId,
                ic.FirstName,
                ic.LastName,
                ic.Email,
                ic.Phone,
                ic.Cellphone,
                ic.InsuranceId,
                ins.Name AS InsuranceName,
                ins.Address AS InsuranceAddress,
                ins.Address2 AS InsuranceAddress2,
                ins.City AS InsuranceCity,
                ins.State AS InsuranceState,
                ins.ZipCode AS InsuranceZipCode
            FROM dbo.InsuranceContacts ic
            INNER JOIN dbo.Insurances ins
                ON ins.Id = ic.InsuranceId
               AND (ins.IsDeleted = 0 OR ins.IsDeleted IS NULL)
            WHERE (ic.IsDeleted = 0 OR ic.IsDeleted IS NULL)
              AND ic.IsAllowPortalAccess = 1
              AND LOWER(LTRIM(RTRIM(ic.Email))) = LOWER(?)
            ORDER BY ic.Id DESC
            """,
            (contact_email,),
        )
        contact_row = cursor.fetchone()

        if not contact_row or contact_row.InsuranceId is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Insurance company not found for this user.",
            )

        insurance_id = int(contact_row.InsuranceId)
        insurance_contact_id = int(contact_row.ContactId)
        first_name = first_name or ((contact_row.FirstName or "").strip() or None)
        last_name = last_name or ((contact_row.LastName or "").strip() or None)
        profile_email = (contact_row.Email or "").strip() or profile_email
        phone = (
            (contact_row.Cellphone or "").strip()
            or (contact_row.Phone or "").strip()
            or phone
        )
        organization = (contact_row.InsuranceName or "").strip() or None
        address = _format_insurance_address(contact_row)

        full_name = " ".join(
            part for part in [first_name, last_name] if part and str(part).strip()
        ).strip()
        if not full_name and current_user.display_name:
            full_name = current_user.display_name.strip()
        if not full_name:
            full_name = profile_email or login_id or "Insurance User"

        return InsuranceProfile(
            user_id=resolved_user_id,
            insurance_id=insurance_id,
            insurance_contact_id=insurance_contact_id,
            full_name=full_name,
            first_name=first_name,
            last_name=last_name,
            title=title,
            email=profile_email,
            phone=phone,
            organization=organization,
            address=address,
            login_id=login_id,
            type_id=type_id,
            type_label=user_type_label(type_id),
        )


def update_profile_in_clinic(
    clinic,
    current_user: CurrentUser,
    *,
    first_name: str,
    last_name: str,
    title: str | None,
    email: str,
    phone: str | None,
) -> InsuranceProfile:
    """
    Update editable identity fields on UserProfiles + InsuranceContacts.
    Does not change LoginId, TypeId, organization, or insurance address.
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
              AND TypeId IN (?, ?)
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
                int(UserType.SuperAdmin),
                int(UserType.InsuranceUser),
            ),
        )
        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User profile not found.",
            )

        if current.insurance_contact_id is not None:
            cursor.execute(
                """
                UPDATE dbo.InsuranceContacts
                SET FirstName = ?,
                    LastName = ?,
                    Email = ?,
                    Phone = ?,
                    Cellphone = ?,
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
                    int(current.insurance_contact_id),
                ),
            )

    return fetch_profile_from_clinic(clinic, current_user)


def _format_insurance_address(row) -> str | None:
    parts = [
        (getattr(row, "InsuranceAddress", None) or "").strip(),
        (getattr(row, "InsuranceAddress2", None) or "").strip(),
    ]
    city = (getattr(row, "InsuranceCity", None) or "").strip()
    state = (getattr(row, "InsuranceState", None) or "").strip()
    zip_code = (getattr(row, "InsuranceZipCode", None) or "").strip()
    if city and state:
        city_line = f"{city}, {state}"
        if zip_code:
            city_line = f"{city_line} {zip_code}"
    else:
        city_line = " ".join(part for part in [city, state, zip_code] if part).strip()
    if city_line:
        parts.append(city_line)
    formatted = ", ".join(part for part in parts if part)
    return formatted or None


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

    if len(last_name) > _NAME_MAX:
        errors["last_name"] = f"Last name must be at most {_NAME_MAX} characters."

    if title and len(title) > _TITLE_MAX:
        errors["title"] = f"Title must be at most {_TITLE_MAX} characters."

    if not email:
        errors["email"] = "Email is required."
    elif len(email) > _EMAIL_MAX:
        errors["email"] = f"Email must be at most {_EMAIL_MAX} characters."
    elif not _EMAIL_RE.match(email):
        errors["email"] = "Enter a valid email address."

    if phone:
        if len(phone) > _PHONE_MAX:
            errors["phone"] = f"Phone must be at most {_PHONE_MAX} characters."
        else:
            digits = re.sub(r"\D", "", phone)
            if len(digits) < _PHONE_DIGITS_MIN:
                errors["phone"] = (
                    f"Enter a valid phone number (at least {_PHONE_DIGITS_MIN} digits)."
                )
    return errors
