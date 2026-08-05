from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.auth.dependencies import CurrentUser, get_current_user
from app.employer.employee_search import default_search_date_range, search_employees
from app.employer.schemas import (
    DashboardSummaryResponse,
    EmployeeSearchResponse,
    EmployerProfileResponse,
)
from app.employer.service import get_dashboard_summary, get_employer_profile

router = APIRouter(prefix="/api/employer", tags=["employer"])


@router.get("/me", response_model=EmployerProfileResponse)
def employer_profile_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    return get_employer_profile(current_user)


@router.get("/dashboard/summary", response_model=DashboardSummaryResponse)
def employer_dashboard_summary_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    return get_dashboard_summary(current_user)


@router.get("/employees/search", response_model=EmployeeSearchResponse)
def employer_employee_search_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    from_date: date | None = Query(default=None, alias="fromDate"),
    to_date: date | None = Query(default=None, alias="toDate"),
):
    default_from, default_to = default_search_date_range()
    start = from_date or default_from
    end = to_date or default_to
    return search_employees(current_user, start, end)
