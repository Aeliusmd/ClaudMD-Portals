from __future__ import annotations

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.db.clinic import get_clinic_by_activation_key, get_clinic_connection
from app.employer.appointments import appointment_count_last_30_days
from app.employer.profile import fetch_profile_from_clinic
from app.employer.schemas import DashboardSummaryResponse, EmployerProfileResponse


def get_employer_profile(current_user: CurrentUser) -> EmployerProfileResponse:
    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )

    profile = fetch_profile_from_clinic(clinic, current_user)
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
    appointments = appointment_count_last_30_days(clinic, profile.employer_id)
    return DashboardSummaryResponse(
        injury=counts["injury"],
        physicals=counts["physicals"],
        drug_screens=counts["drug_screens"],
        appointments=appointments,
        days=30,
        employer_id=profile.employer_id,
    )


def _fetch_checkin_counts(clinic, employer_id: int) -> dict[str, int]:
    """
    Read-only counts from CheckInsHeader for the employer's patients (last 30 days).

    Injury: VisitTypes.CategoryId = 1 (workers comp / injury visit types).
    Physicals: VisitTypes.CategoryId = 2, excluding drug screen code PDS.
    Drug screens: VisitTypes.Code = 'PDS'.

    CheckInsHeader.VisitTypeId stores VisitTypes.Id (e.g. 14=WNI, 39=PDS),
    not the category id directly.
    """
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()

        base_filter = """
            ch.EmployerId = ?
            AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
            AND ch.CheckInDate IS NOT NULL
            AND ch.CheckInDate >= DATEADD(day, -30, CAST(GETDATE() AS date))
            AND ch.CheckInDate <= CAST(GETDATE() AS date)
        """

        cursor.execute(
            f"""
            SELECT COUNT(*)
            FROM dbo.CheckInsHeader ch
            INNER JOIN dbo.VisitTypes vt ON vt.Id = ch.VisitTypeId
            WHERE {base_filter}
              AND vt.CategoryId = 1
            """,
            (employer_id,),
        )
        injury = int(cursor.fetchone()[0])

        cursor.execute(
            f"""
            SELECT COUNT(*)
            FROM dbo.CheckInsHeader ch
            INNER JOIN dbo.VisitTypes vt ON vt.Id = ch.VisitTypeId
            WHERE {base_filter}
              AND vt.CategoryId = 2
              AND vt.Code <> 'PDS'
            """,
            (employer_id,),
        )
        physicals = int(cursor.fetchone()[0])

        cursor.execute(
            f"""
            SELECT COUNT(*)
            FROM dbo.CheckInsHeader ch
            INNER JOIN dbo.VisitTypes vt ON vt.Id = ch.VisitTypeId
            WHERE {base_filter}
              AND vt.Code = 'PDS'
            """,
            (employer_id,),
        )
        drug_screens = int(cursor.fetchone()[0])

    return {
        "injury": injury,
        "physicals": physicals,
        "drug_screens": drug_screens,
    }
