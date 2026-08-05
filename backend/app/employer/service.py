from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.db.clinic import get_clinic_by_activation_key, get_clinic_connection
from app.employer.schemas import EmployerProfileResponse


@dataclass(frozen=True)
class EmployerProfile:
    user_id: int | None
    employer_id: int | None
    employer_contact_id: int | None
    full_name: str
    title: str | None
    email: str | None
    phone: str | None
    organization: str | None
    login_id: str | None


def get_employer_profile(current_user: CurrentUser) -> EmployerProfileResponse:
    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )

    profile = _fetch_profile_from_clinic(clinic, current_user)
    return EmployerProfileResponse(
        user_id=profile.user_id,
        employer_id=profile.employer_id,
        employer_contact_id=profile.employer_contact_id,
        full_name=profile.full_name,
        title=profile.title,
        email=profile.email,
        phone=profile.phone,
        organization=profile.organization,
        login_id=profile.login_id,
    )


def _fetch_profile_from_clinic(clinic, current_user: CurrentUser) -> EmployerProfile:
    """Read-only SELECT from UserProfiles, EmployerContacts, and Employers."""
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
                    Id, LoginId, Email, FirstName, LastName, Title, Phone, CellPhone
                FROM dbo.UserProfiles
                WHERE Id = ?
                  AND (IsDeleted = 0 OR IsDeleted IS NULL)
                  AND RecordStatusId = 1
                """,
                (user_id,),
            )
            user_row = cursor.fetchone()

        if not user_row and login:
            cursor.execute(
                """
                SELECT TOP 1
                    Id, LoginId, Email, FirstName, LastName, Title, Phone, CellPhone
                FROM dbo.UserProfiles
                WHERE (IsDeleted = 0 OR IsDeleted IS NULL)
                  AND RecordStatusId = 1
                  AND (
                        LOWER(LTRIM(RTRIM(LoginId))) = LOWER(?)
                     OR LOWER(LTRIM(RTRIM(Email))) = LOWER(?)
                  )
                """,
                (login, email),
            )
            user_row = cursor.fetchone()

        resolved_user_id = int(user_row.Id) if user_row else user_id
        contact_row = None
        employer_row = None

        if resolved_user_id is not None or email:
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
                    COALESCE(pa.EmployerId, ec.EmployerId) AS ResolvedEmployerId
                FROM dbo.EmployerContacts ec
                LEFT JOIN dbo.EmployerContactPortalAccess pa
                    ON pa.EmployerContactId = ec.Id
                   AND (pa.IsDeleted = 0 OR pa.IsDeleted IS NULL)
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
                (resolved_user_id, resolved_user_id, email, resolved_user_id),
            )
            contact_row = cursor.fetchone()

        employer_id = None
        if contact_row and contact_row.ResolvedEmployerId is not None:
            employer_id = int(contact_row.ResolvedEmployerId)
            cursor.execute(
                """
                SELECT TOP 1 Id, Name
                FROM dbo.Employers
                WHERE Id = ?
                  AND (IsDeleted = 0 OR IsDeleted IS NULL)
                """,
                (employer_id,),
            )
            employer_row = cursor.fetchone()

    first_name = None
    last_name = None
    title = None
    phone = None
    profile_email = email or None
    login_id = login or None

    if user_row:
        first_name = user_row.FirstName
        last_name = user_row.LastName
        title = user_row.Title
        profile_email = user_row.Email or profile_email
        login_id = user_row.LoginId or login_id
        phone = user_row.CellPhone or user_row.Phone

    if contact_row:
        first_name = first_name or contact_row.FirstName
        last_name = last_name or contact_row.LastName
        profile_email = contact_row.Email or profile_email
        phone = phone or contact_row.CellPhone or contact_row.Phone

    full_name = " ".join(
        part for part in [first_name, last_name] if part and str(part).strip()
    ).strip()

    if not full_name and current_user.display_name:
        full_name = current_user.display_name.strip()
    if not full_name:
        full_name = profile_email or login_id or "Employer User"

    occupation = (title or "").strip() or None
    organization = employer_row.Name.strip() if employer_row and employer_row.Name else None

    return EmployerProfile(
        user_id=resolved_user_id,
        employer_id=employer_id,
        employer_contact_id=int(contact_row.ContactId) if contact_row else None,
        full_name=full_name,
        title=occupation,
        email=profile_email,
        phone=phone,
        organization=organization,
        login_id=login_id,
    )
