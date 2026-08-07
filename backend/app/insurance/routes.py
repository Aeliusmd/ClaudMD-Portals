from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.auth.dependencies import CurrentUser, get_current_user
from app.insurance.patient_detail import get_patient_detail
from app.insurance.patients import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    default_search_date_range,
    search_patients,
)
from app.insurance.schemas import (
    InsuranceDashboardSummaryResponse,
    InsurancePatientDetailResponse,
    InsurancePatientSearchResponse,
    InsuranceProfileResponse,
)
from app.insurance.service import get_dashboard_summary, get_insurance_profile

router = APIRouter(prefix="/api/insurance", tags=["insurance"])


@router.get("/me", response_model=InsuranceProfileResponse)
def insurance_profile_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Logged-in insurance contact + company (SELECT only)."""
    return get_insurance_profile(current_user)


@router.get("/dashboard/summary", response_model=InsuranceDashboardSummaryResponse)
def insurance_dashboard_summary_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """
    Last-30-day KPI counts for the logged-in user's insurance company:
    Workers Comp patients, Private Insurance patients, unread shared reports.
    """
    return get_dashboard_summary(current_user)


@router.get("/patients/search", response_model=InsurancePatientSearchResponse)
def insurance_patient_search_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    from_date: date | None = Query(default=None, alias="fromDate"),
    to_date: date | None = Query(default=None, alias="toDate"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(
        default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE, alias="pageSize"
    ),
    search: str | None = Query(default=None),
    coverage: str = Query(
        default="workers_comp",
        description="workers_comp (EmployerId set) or private (EmployerId null)",
    ),
):
    """
    Unique patients from CheckInsHeader for this insurer + coverage type.
    Workers Comp: InsuranceId match AND EmployerId IS NOT NULL.
    Private: InsuranceId match AND EmployerId IS NULL.
    SELECT only; server-side pagination.
    """
    default_from, default_to = default_search_date_range()
    start = from_date or default_from
    end = to_date or default_to
    return search_patients(
        current_user,
        start,
        end,
        coverage=coverage,
        page=page,
        page_size=page_size,
        search=search,
    )


@router.get("/patients/{patient_id}", response_model=InsurancePatientDetailResponse)
def insurance_patient_detail_endpoint(
    patient_id: int,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    from_date: date | None = Query(default=None, alias="fromDate"),
    to_date: date | None = Query(default=None, alias="toDate"),
    coverage: str | None = Query(
        default=None,
        description="Optional: workers_comp or private — scopes EmployerId filter",
    ),
):
    """
    Patient demographics + visit history + published documents for this insurer.
    SELECT only. Patient must have CheckInsHeader rows with matching InsuranceId.
    Pass coverage=private for Private Insurance detail (no employer).
    """
    return get_patient_detail(
        current_user,
        patient_id,
        from_date=from_date,
        to_date=to_date,
        coverage=coverage,
    )
