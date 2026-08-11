from __future__ import annotations

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.db.clinic import get_clinic_by_activation_key, get_clinic_connection
from app.employer.appointments import appointment_count_upcoming
from app.employer.notifications import count_unread_shared_reports
from app.employer.profile import fetch_profile_from_clinic, update_profile_in_clinic
from app.employer.schemas import (
    DashboardSummaryResponse,
    EmployerProfileResponse,
    EmployerProfileUpdateRequest,
)


def _to_profile_response(profile) -> EmployerProfileResponse:
    return EmployerProfileResponse(
        user_id=profile.user_id,
        employer_id=profile.employer_id,
        employer_contact_id=profile.employer_contact_id,
        full_name=profile.full_name,
        first_name=profile.first_name,
        last_name=profile.last_name,
        title=profile.title,
        email=profile.email,
        phone=profile.phone,
        organization=profile.organization,
        address=profile.address,
        login_id=profile.login_id,
        type_id=profile.type_id,
        type_label=profile.type_label,
    )


def get_employer_profile(current_user: CurrentUser) -> EmployerProfileResponse:
    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )

    profile = fetch_profile_from_clinic(clinic, current_user)
    return _to_profile_response(profile)


def update_employer_profile(
    current_user: CurrentUser,
    payload: EmployerProfileUpdateRequest,
) -> EmployerProfileResponse:
    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )

    profile = update_profile_in_clinic(
        clinic,
        current_user,
        first_name=payload.first_name,
        last_name=payload.last_name or "",
        title=payload.title,
        email=payload.email,
        phone=payload.phone,
    )
    return _to_profile_response(profile)


def get_dashboard_summary(current_user: CurrentUser) -> DashboardSummaryResponse:
    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )

    profile = fetch_profile_from_clinic(clinic, current_user)
    if profile.employer_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employer not found for this user.",
        )

    counts = _fetch_checkin_counts(clinic, profile.employer_id)
    appointments = appointment_count_upcoming(clinic, profile.employer_id)
    unread_reports = count_unread_shared_reports(clinic, profile)
    return DashboardSummaryResponse(
        injury=counts["injury"],
        physicals=counts["physicals"],
        drug_screens=counts["drug_screens"],
        appointments=appointments,
        unread_reports=unread_reports,
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
