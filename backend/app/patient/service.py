"""Patient portal dashboard, visits, and profile service."""

from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.db.clinic import (
    get_clinic_by_activation_key,
    get_clinic_connection,
    shared_documents_has_is_viewed,
)
from app.employer.shift_type import shift_type_label
from app.patient.information import get_patient_information
from app.patient.notifications import _recipient_clause
from app.patient.profile import PatientProfile, fetch_profile_from_clinic, update_profile_in_clinic
from app.patient.schemas import (
    PatientDashboardSummaryResponse,
    PatientInformationResponse,
    PatientProfileResponse,
    PatientProfileUpdateRequest,
    PatientVisitListResponse,
    PatientVisitRow,
)

LOOKBACK_DAYS = 30

# Frontend KPI tab keys → VisitTypes.CategoryId filter (+ display label).
_VISIT_CATEGORY_FILTERS: dict[str, tuple[str, str]] = {
    "urgentcare": (
        "vt.CategoryId = 3",
        "Urgent Care",
    ),
    "personalinjury": (
        "vt.CategoryId = 4",
        "Personal Injury",
    ),
    "physicals": (
        "vt.CategoryId = 2 AND UPPER(LTRIM(RTRIM(ISNULL(vt.Code, '')))) <> 'PDS'",
        "Physical",
    ),
    "injury": (
        "vt.CategoryId = 1",
        "Injury",
    ),
}


def get_dashboard_summary(
    current_user: CurrentUser,
) -> PatientDashboardSummaryResponse:
    clinic = _require_clinic(current_user)
    profile = fetch_profile_from_clinic(clinic, current_user)
    patient_id = _require_patient_id(profile)

    counts = _fetch_checkin_counts(clinic, patient_id)
    appointments = _count_upcoming_appointments(clinic, patient_id)
    unread_reports = _count_unread_shared_reports(clinic, profile)

    return PatientDashboardSummaryResponse(
        urgent_care=counts["urgent_care"],
        personal_injury=counts["personal_injury"],
        physicals=counts["physicals"],
        injury=counts["injury"],
        appointments=appointments,
        unread_reports=unread_reports,
        days=LOOKBACK_DAYS,
        patient_id=patient_id,
    )


def list_dashboard_visits(
    current_user: CurrentUser,
    *,
    category: str,
    from_date: date | None = None,
    to_date: date | None = None,
    search: str | None = None,
) -> PatientVisitListResponse:
    """
    Read-only visit rows for the logged-in patient, filtered by KPI category.

    Tables (SELECT only):
      CheckInsHeader, VisitTypes, Providers, Locations, AppointmentResources,
      EHRWorkStatuses, DocterPublishes
    """
    clinic = _require_clinic(current_user)
    profile = fetch_profile_from_clinic(clinic, current_user)
    patient_id = _require_patient_id(profile)

    cat_key = _normalize_category_key(category)
    filter_info = _VISIT_CATEGORY_FILTERS.get(cat_key)
    if not filter_info:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Unsupported category. Use urgentCare, personalInjury, "
                "physicals, or injury."
            ),
        )
    category_sql, category_label = filter_info

    start, end = _resolve_date_range(from_date, to_date)
    items = _fetch_visit_rows(
        clinic=clinic,
        patient_id=patient_id,
        category_sql=category_sql,
        category_label=category_label,
        from_date=start,
        to_date=end,
        search=search,
    )
    return PatientVisitListResponse(
        items=items,
        total=len(items),
        category=category_label,
        from_date=start.isoformat(),
        to_date=end.isoformat(),
        patient_id=patient_id,
    )


def default_visit_date_range() -> tuple[date, date]:
    today = date.today()
    return today - timedelta(days=LOOKBACK_DAYS), today


def _normalize_category_key(category: str) -> str:
    return (
        (category or "")
        .strip()
        .lower()
        .replace("_", "")
        .replace("-", "")
        .replace(" ", "")
    )


def _resolve_date_range(
    from_date: date | None,
    to_date: date | None,
) -> tuple[date, date]:
    default_from, default_to = default_visit_date_range()
    start = from_date or default_from
    end = to_date or default_to
    if start > end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="From date must be on or before to date.",
        )
    return start, end


def _fetch_visit_rows(
    *,
    clinic,
    patient_id: int,
    category_sql: str,
    category_label: str,
    from_date: date,
    to_date: date,
    search: str | None,
) -> list[PatientVisitRow]:
    q = (search or "").strip()
    search_sql = ""
    search_params: list = []
    if q:
        search_sql = """
              AND (
                    LOWER(ISNULL(prov.Name, '')) LIKE ?
                 OR LOWER(ISNULL(prov.FirstName, '') + ' ' + ISNULL(prov.LastName, '')) LIKE ?
                 OR LOWER(ISNULL(ar.Name, '')) LIKE ?
                 OR LOWER(ISNULL(loc.Name, '')) LIKE ?
                 OR CAST(ch.Id AS varchar(32)) LIKE ?
              )
        """
        like = f"%{q.lower()}%"
        search_params = [like, like, like, like, like]

    sql = f"""
        SELECT
            ch.Id AS CheckInId,
            ch.CheckInDate,
            vt.Description AS VisitTypeDescription,
            vt.Code AS VisitTypeCode,
            vt.CategoryId AS VisitCategoryId,
            COALESCE(
                NULLIF(LTRIM(RTRIM(prov.Name)), ''),
                NULLIF(
                    LTRIM(RTRIM(ISNULL(prov.FirstName, '') + ' ' + ISNULL(prov.LastName, ''))),
                    ''
                ),
                NULLIF(LTRIM(RTRIM(ar.Name)), ''),
                '—'
            ) AS ProviderName,
            COALESCE(NULLIF(LTRIM(RTRIM(loc.Name)), ''), '—') AS LocationName,
            ews.CurrentWorkShiftTypeId,
            (
                SELECT COUNT(*)
                FROM dbo.DocterPublishes dp
                WHERE dp.CheckInId = ch.Id
                  AND (dp.IsDeleted = 0 OR dp.IsDeleted IS NULL)
            ) AS DocumentCount
        FROM dbo.CheckInsHeader ch
        INNER JOIN dbo.VisitTypes vt ON vt.Id = ch.VisitTypeId
        LEFT JOIN dbo.Providers prov ON prov.Id = ch.ProviderId
        LEFT JOIN dbo.Locations loc ON loc.Id = ch.LocationId
        LEFT JOIN dbo.AppointmentResources ar ON ar.Id = ch.ResourceId
        OUTER APPLY (
            SELECT TOP 1 ws.CurrentWorkShiftTypeId
            FROM dbo.EHRWorkStatuses ws
            WHERE ws.CheckInId = ch.Id
              AND (ws.IsDeleted = 0 OR ws.IsDeleted IS NULL)
            ORDER BY ws.Id DESC
        ) ews
        WHERE ch.PatientId = ?
          AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
          AND ch.CheckInDate IS NOT NULL
          AND ch.CheckInDate >= ?
          AND ch.CheckInDate <= ?
          AND ({category_sql})
          {search_sql}
        ORDER BY ch.CheckInDate DESC, ch.Id DESC
    """

    params = [int(patient_id), from_date, to_date, *search_params]

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(sql, tuple(params))
        columns = [col[0] for col in cursor.description]
        rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

    return [_map_visit_row(row, category_label) for row in rows]


def _map_visit_row(row: dict, category_label: str) -> PatientVisitRow:
    check_in_id = int(row["CheckInId"])
    work_status = shift_type_label(row.get("CurrentWorkShiftTypeId")) or "—"
    visit_type = (
        (row.get("VisitTypeDescription") or "").strip()
        or (row.get("VisitTypeCode") or "").strip()
        or None
    )
    return PatientVisitRow(
        id=str(check_in_id),
        check_in_id=check_in_id,
        category=category_label,
        provider=(row.get("ProviderName") or "").strip() or "—",
        location=(row.get("LocationName") or "").strip() or "—",
        date=_format_display_date(row.get("CheckInDate")),
        date_value=_format_date_iso(row.get("CheckInDate")),
        work_status=work_status,
        document_count=int(row.get("DocumentCount") or 0),
        visit_type=visit_type,
    )


def _format_date_iso(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _format_display_date(value) -> str | None:
    iso = _format_date_iso(value)
    if not iso:
        return None
    try:
        parsed = datetime.strptime(iso, "%Y-%m-%d")
        return parsed.strftime("%b %d, %Y")
    except ValueError:
        return iso



def get_patient_profile(current_user: CurrentUser) -> PatientProfileResponse:
    clinic = _require_clinic(current_user)
    profile = fetch_profile_from_clinic(clinic, current_user)
    return _to_response(profile)


def update_patient_profile(
    current_user: CurrentUser,
    payload: PatientProfileUpdateRequest,
) -> PatientProfileResponse:
    clinic = _require_clinic(current_user)
    profile = update_profile_in_clinic(
        clinic,
        current_user,
        full_name=payload.full_name,
        date_of_birth=payload.date_of_birth,
        email=payload.email,
        phone=payload.phone,
        address=payload.address,
    )
    return _to_response(profile)


def get_my_information(current_user: CurrentUser) -> PatientInformationResponse:
    clinic = _require_clinic(current_user)
    return get_patient_information(clinic, current_user)


def _to_response(profile) -> PatientProfileResponse:
    return PatientProfileResponse(
        user_id=profile.user_id,
        patient_id=profile.patient_id,
        full_name=profile.full_name,
        first_name=profile.first_name,
        last_name=profile.last_name,
        date_of_birth=profile.date_of_birth,
        email=profile.email,
        phone=profile.phone,
        address=profile.address,
        login_id=profile.login_id,
        type_id=profile.type_id,
        type_label=profile.type_label,
    )


def _require_patient_id(profile: PatientProfile) -> int:
    if profile.patient_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient record not found for this account.",
        )
    return int(profile.patient_id)


def _require_clinic(current_user: CurrentUser):
    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )
    return clinic


def _fetch_checkin_counts(clinic, patient_id: int) -> dict[str, int]:
    """
    Last-30-day visit KPI counts for one patient.

    Injury: CategoryId = 1
    Physicals: CategoryId = 2, Code <> 'PDS'
    Urgent Care: CategoryId = 3 (private/cash outpatient bucket)
    Personal Injury: CategoryId = 4
    """
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                SUM(
                    CASE WHEN vt.CategoryId = 3 THEN 1 ELSE 0 END
                ) AS UrgentCareCount,
                SUM(
                    CASE WHEN vt.CategoryId = 4 THEN 1 ELSE 0 END
                ) AS PersonalInjuryCount,
                SUM(
                    CASE
                        WHEN vt.CategoryId = 2
                         AND UPPER(LTRIM(RTRIM(ISNULL(vt.Code, '')))) <> 'PDS'
                        THEN 1 ELSE 0
                    END
                ) AS PhysicalsCount,
                SUM(
                    CASE WHEN vt.CategoryId = 1 THEN 1 ELSE 0 END
                ) AS InjuryCount
            FROM dbo.CheckInsHeader ch
            INNER JOIN dbo.VisitTypes vt ON vt.Id = ch.VisitTypeId
            WHERE ch.PatientId = ?
              AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
              AND ch.CheckInDate IS NOT NULL
              AND ch.CheckInDate >= DATEADD(day, -?, CAST(GETDATE() AS date))
              AND ch.CheckInDate <= CAST(GETDATE() AS date)
            """,
            (int(patient_id), LOOKBACK_DAYS),
        )
        row = cursor.fetchone()

    return {
        "urgent_care": int(row.UrgentCareCount or 0) if row else 0,
        "personal_injury": int(row.PersonalInjuryCount or 0) if row else 0,
        "physicals": int(row.PhysicalsCount or 0) if row else 0,
        "injury": int(row.InjuryCount or 0) if row else 0,
    }


def _count_upcoming_appointments(clinic, patient_id: int) -> int:
    """Upcoming (now-or-future) appointment schedules for this patient."""
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT COUNT(*)
            FROM dbo.AppointmentSchedules s
            LEFT JOIN dbo.Appointments a ON a.Id = s.AppointmentId
            LEFT JOIN dbo.CheckInsHeader ch ON ch.Id = s.CheckInId
            WHERE (s.IsDeleted = 0 OR s.IsDeleted IS NULL)
              AND COALESCE(a.PatientId, ch.PatientId) = ?
              AND s.Date IS NOT NULL
              AND s.StartTime IS NOT NULL
              AND (
                    s.Date > CAST(GETDATE() AS date)
                 OR (
                        s.Date = CAST(GETDATE() AS date)
                    AND s.StartTime >= CAST(GETDATE() AS time)
                    )
              )
            """,
            (int(patient_id),),
        )
        return int(cursor.fetchone()[0] or 0)


def _count_unread_shared_reports(clinic, profile: PatientProfile) -> int:
    """
    Unread SharedDocuments shared with this patient user (last 30 days).

    Recipient: ShareWithUserId or Email for the logged-in patient.
    Scope: visit must belong to this patient's own chart.
    """
    if not shared_documents_has_is_viewed(clinic):
        return 0
    if profile.patient_id is None:
        return 0

    email_norm = (profile.email or profile.login_id or "").strip().lower() or None
    recipient_sql, recipient_params = _recipient_clause(profile.user_id, email_norm)
    if recipient_sql == "1 = 0":
        return 0

    sql = f"""
        SELECT COUNT(DISTINCT sd.Id)
        FROM dbo.SharedDocuments sd
        INNER JOIN dbo.DocumentUploads du
            ON du.Id = sd.DocumentId
           AND sd.DocumentTypeId = 2
           AND (du.IsDeleted = 0 OR du.IsDeleted IS NULL)
        INNER JOIN dbo.CheckInsHeader ch
            ON ch.Id = du.HeaderObjectId
           AND du.ObjectTypeId = 53
           AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
        WHERE (sd.IsDeleted = 0 OR sd.IsDeleted IS NULL)
          AND ISNULL(sd.IsViewed, 0) = 0
          AND sd.CreatedDateTime >= DATEADD(day, -?, SYSDATETIMEOFFSET())
          AND ({recipient_sql})
          AND ch.PatientId = ?
    """
    params = [
        LOOKBACK_DAYS,
        *recipient_params,
        int(profile.patient_id),
    ]

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(sql, tuple(params))
        row = cursor.fetchone()
        return int(row[0] or 0) if row else 0
