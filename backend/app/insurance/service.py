"""Insurance portal profile, profile update, and dashboard summary."""

from __future__ import annotations

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.db.clinic import get_clinic_by_activation_key, get_clinic_connection
from app.insurance.profile import InsuranceProfile, fetch_profile_from_clinic, update_profile_in_clinic
from app.insurance.schemas import (
    InsuranceDashboardSummaryResponse,
    InsuranceProfileResponse,
    InsuranceProfileUpdateRequest,
)

LOOKBACK_DAYS = 30


def get_insurance_profile(current_user: CurrentUser) -> InsuranceProfileResponse:
    clinic = _require_clinic(current_user)
    profile = fetch_profile_from_clinic(clinic, current_user)
    return _to_response(profile)


def update_insurance_profile(
    current_user: CurrentUser,
    payload: InsuranceProfileUpdateRequest,
) -> InsuranceProfileResponse:
    clinic = _require_clinic(current_user)
    profile = update_profile_in_clinic(
        clinic,
        current_user,
        first_name=payload.first_name,
        last_name=payload.last_name,
        title=payload.title,
        email=payload.email,
        phone=payload.phone,
    )
    return _to_response(profile)


def get_dashboard_summary(
    current_user: CurrentUser,
) -> InsuranceDashboardSummaryResponse:
    clinic = _require_clinic(current_user)

    profile = fetch_profile_from_clinic(clinic, current_user)
    if profile.insurance_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Insurance company not found for this user.",
        )

    workers_comp, private_insurance = _fetch_patient_counts(
        clinic, profile.insurance_id
    )
    unread_reports = _count_unread_shared_reports(clinic, profile)

    return InsuranceDashboardSummaryResponse(
        workers_comp=workers_comp,
        private_insurance=private_insurance,
        unread_reports=unread_reports,
        days=LOOKBACK_DAYS,
        insurance_id=profile.insurance_id,
    )


def _require_clinic(current_user: CurrentUser):
    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )
    return clinic


def _to_response(profile) -> InsuranceProfileResponse:
    return InsuranceProfileResponse(
        user_id=profile.user_id,
        insurance_id=profile.insurance_id,
        insurance_contact_id=profile.insurance_contact_id,
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


def _fetch_patient_counts(clinic, insurance_id: int) -> tuple[int, int]:
    """
    Unique patients with check-ins in the last 30 days for this insurer.

    Workers Comp  → CheckInsHeader.EmployerId IS NOT NULL
    Private       → CheckInsHeader.EmployerId IS NULL
    """
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                COUNT(DISTINCT CASE
                    WHEN ch.EmployerId IS NOT NULL THEN ch.PatientId
                END) AS WorkersCompPatients,
                COUNT(DISTINCT CASE
                    WHEN ch.EmployerId IS NULL THEN ch.PatientId
                END) AS PrivateInsurancePatients
            FROM dbo.CheckInsHeader ch
            WHERE ch.InsuranceId = ?
              AND ch.PatientId IS NOT NULL
              AND ch.CheckInDate IS NOT NULL
              AND ch.CheckInDate >= DATEADD(day, -?, CAST(GETDATE() AS date))
              AND ch.CheckInDate <= CAST(GETDATE() AS date)
              AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
            """,
            (int(insurance_id), LOOKBACK_DAYS),
        )
        row = cursor.fetchone()
        workers = int(row.WorkersCompPatients or 0) if row else 0
        private = int(row.PrivateInsurancePatients or 0) if row else 0
        return workers, private


def _count_unread_shared_reports(clinic, profile: InsuranceProfile) -> int:
    """Unread SharedDocuments for this insurance contact (last 30 days)."""
    email = (profile.email or profile.login_id or "").strip().lower()
    user_id = profile.user_id

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT COUNT(*)
            FROM dbo.SharedDocuments sd
            WHERE (sd.IsDeleted = 0 OR sd.IsDeleted IS NULL)
              AND ISNULL(sd.IsViewed, 0) = 0
              AND sd.CreatedDateTime >= DATEADD(day, -?, SYSDATETIMEOFFSET())
              AND (
                    (? <> '' AND LOWER(LTRIM(RTRIM(sd.Email))) = ?)
                 OR (? IS NOT NULL AND sd.ShareWithUserId = ?)
              )
            """,
            (LOOKBACK_DAYS, email, email, user_id, user_id),
        )
        row = cursor.fetchone()
        return int(row[0] or 0) if row else 0
