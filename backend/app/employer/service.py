from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.auth.user_profile_type import user_type_label
from app.db.clinic import get_clinic_by_activation_key, get_clinic_connection
from app.employer.schemas import DashboardSummaryResponse, EmployerProfileResponse


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
    address: str | None
    login_id: str | None
    type_id: int | None = None
    type_label: str | None = None


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
        address=profile.address,
        login_id=profile.login_id,
        type_id=profile.type_id,
        type_label=profile.type_label,
    )


def get_dashboard_summary(current_user: CurrentUser) -> DashboardSummaryResponse:
    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )

    profile = _fetch_profile_from_clinic(clinic, current_user)
    if profile.employer_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employer not found for this user.",
        )

    counts = _fetch_checkin_counts(clinic, profile.employer_id)
    return DashboardSummaryResponse(
        injury=counts["injury"],
        physicals=counts["physicals"],
        drug_screens=counts["drug_screens"],
        days=30,
        employer_id=profile.employer_id,
    )


def _fetch_checkin_counts(clinic, employer_id: int) -> dict[str, int]:
    """
    Read-only KPI counts from CheckInsHeader (last 30 days) in one query.

    Injury: VisitTypes.CategoryId = 1
    Physicals: VisitTypes.CategoryId = 2, excluding drug screen code PDS
    Drug screens: VisitTypes.Code = 'PDS'
    """
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                SUM(CASE WHEN vt.CategoryId = 1 THEN 1 ELSE 0 END) AS InjuryCount,
                SUM(
                    CASE
                        WHEN vt.CategoryId = 2
                         AND UPPER(LTRIM(RTRIM(ISNULL(vt.Code, '')))) <> 'PDS'
                        THEN 1 ELSE 0
                    END
                ) AS PhysicalsCount,
                SUM(
                    CASE
                        WHEN UPPER(LTRIM(RTRIM(ISNULL(vt.Code, '')))) = 'PDS'
                        THEN 1 ELSE 0
                    END
                ) AS DrugScreensCount
            FROM dbo.CheckInsHeader ch
            INNER JOIN dbo.VisitTypes vt ON vt.Id = ch.VisitTypeId
            WHERE ch.EmployerId = ?
              AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
              AND ch.CheckInDate IS NOT NULL
              AND ch.CheckInDate >= DATEADD(day, -30, CAST(GETDATE() AS date))
              AND ch.CheckInDate <= CAST(GETDATE() AS date)
            """,
            (employer_id,),
        )
        row = cursor.fetchone()

    return {
        "injury": int(row.InjuryCount or 0) if row else 0,
        "physicals": int(row.PhysicalsCount or 0) if row else 0,
        "drug_screens": int(row.DrugScreensCount or 0) if row else 0,
    }


def _fetch_profile_from_clinic(clinic, current_user: CurrentUser) -> EmployerProfile:
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
                """,
                (login, email),
            )
            user_row = cursor.fetchone()

        resolved_user_id = int(user_row.Id) if user_row else user_id
        profile_email = (
            ((user_row.Email or "").strip() if user_row else None) or email or None
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

    first_name = None
    last_name = None
    title = None
    phone = None
    login_id = login or None
    type_id = None

    if user_row:
        first_name = user_row.FirstName
        last_name = user_row.LastName
        title = user_row.Title
        profile_email = (user_row.Email or "").strip() or profile_email
        login_id = user_row.LoginId or login_id
        phone = user_row.CellPhone or user_row.Phone
        if user_row.TypeId is not None:
            try:
                type_id = int(user_row.TypeId)
            except (TypeError, ValueError):
                type_id = None

    employer_id = None
    organization = None
    address = None
    if contact_row:
        first_name = first_name or contact_row.FirstName
        last_name = last_name or contact_row.LastName
        profile_email = (contact_row.Email or "").strip() or profile_email
        phone = phone or contact_row.CellPhone or contact_row.Phone
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
