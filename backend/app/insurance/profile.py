from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.auth.user_profile_type import UserType, user_type_label
from app.db.clinic import get_clinic_connection


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
    """
    Read-only profile for insurance portal users.

    UserProfiles → InsuranceContacts (matched by email) → Insurances.
    """
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

        resolved_user_id = int(user_row.Id)
        profile_email = ((user_row.Email or "").strip() or email or None)
        profile_login = ((user_row.LoginId or "").strip() or login or None)
        type_id = None
        if user_row.TypeId is not None:
            try:
                type_id = int(user_row.TypeId)
            except (TypeError, ValueError):
                type_id = None

        if type_id not in {int(UserType.SuperAdmin), int(UserType.InsuranceUser)}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This account is not enabled for the insurance portal.",
            )

        contact_email = (profile_email or profile_login or "").strip()
        cursor.execute(
            """
            SELECT TOP 1
                ic.Id AS ContactId,
                ic.InsuranceId,
                ic.FirstName,
                ic.LastName,
                ic.Email,
                ic.Phone,
                ic.Cellphone,
                i.Name AS InsuranceName,
                i.Address AS InsuranceAddress,
                i.Address2 AS InsuranceAddress2,
                i.City AS InsuranceCity,
                i.State AS InsuranceState,
                i.ZipCode AS InsuranceZipCode
            FROM dbo.InsuranceContacts ic
            INNER JOIN dbo.Insurances i ON i.Id = ic.InsuranceId
            WHERE (ic.IsDeleted = 0 OR ic.IsDeleted IS NULL)
              AND (i.IsDeleted = 0 OR i.IsDeleted IS NULL)
              AND ic.IsAllowPortalAccess = 1
              AND LOWER(LTRIM(RTRIM(ic.Email))) = LOWER(?)
            ORDER BY ic.Id DESC
            """,
            (contact_email,),
        )
        contact = cursor.fetchone()

        if not contact or contact.InsuranceId is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Insurance company not found for this user.",
            )

        first = (
            (contact.FirstName or "").strip()
            or (user_row.FirstName or "").strip()
            or None
        )
        last = (
            (contact.LastName or "").strip()
            or (user_row.LastName or "").strip()
            or None
        )
        name_parts = [p for p in [first, last] if p]
        full_name = " ".join(name_parts) if name_parts else (profile_login or "User")

        phone = (
            (contact.Cellphone or "").strip()
            or (contact.Phone or "").strip()
            or (user_row.CellPhone or "").strip()
            or (user_row.Phone or "").strip()
            or None
        )

        city_state = ", ".join(
            p
            for p in [
                (contact.InsuranceCity or "").strip(),
                (contact.InsuranceState or "").strip(),
            ]
            if p
        )
        address = ", ".join(
            p
            for p in [
                (contact.InsuranceAddress or "").strip(),
                (contact.InsuranceAddress2 or "").strip(),
                city_state,
                (contact.InsuranceZipCode or "").strip(),
            ]
            if p
        ) or None

        return InsuranceProfile(
            user_id=resolved_user_id,
            insurance_id=int(contact.InsuranceId),
            insurance_contact_id=int(contact.ContactId),
            full_name=full_name,
            first_name=first,
            last_name=last,
            title=(user_row.Title or "").strip() or None,
            email=profile_email or (contact.Email or "").strip() or None,
            phone=phone,
            organization=(contact.InsuranceName or "").strip() or None,
            address=address,
            login_id=profile_login,
            type_id=type_id,
            type_label=user_type_label(type_id),
        )
