from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth.dependencies import CurrentUser, get_current_user
from app.employer.dashboard import get_dashboard_summary
from app.employer.employees import list_employer_employees
from app.employer.schemas import (
    DashboardSummaryResponse,
    EmployeeListResponse,
    EmployerProfileResponse,
)
from app.employer.service import get_employer_profile

router = APIRouter(prefix="/api/employer", tags=["employer"])

Current = Annotated[CurrentUser, Depends(get_current_user)]


def _require_employer(current_user: CurrentUser) -> EmployerProfileResponse:
    profile = get_employer_profile(current_user)
    if profile.employer_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No employer organization found for this user.",
        )
    return profile


@router.get("/me", response_model=EmployerProfileResponse)
def employer_profile_endpoint(current_user: Current):
    return get_employer_profile(current_user)


@router.get("/dashboard/summary", response_model=DashboardSummaryResponse)
def dashboard_summary_endpoint(current_user: Current):
    """
    Last-30-day KPI counts from CheckInsHeader (SELECT only):
      injury      → VisitTypes.CategoryId = 1
      physicals   → VisitTypes.CategoryId = 2 AND Code <> 'PDS'
      drugScreens → VisitTypes.Code = 'PDS'
    """
    from app.db.clinic import get_clinic_by_activation_key

    profile = _require_employer(current_user)
    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )

    summary = get_dashboard_summary(clinic, employer_id=profile.employer_id)
    return DashboardSummaryResponse(
        employerId=profile.employer_id,
        employerName=profile.organization,
        fromDate=summary["from"],
        toDate=summary["to"],
        last30Days={
            "injury": summary["injury"],
            "physicals": summary["physicals"],
            "drugScreens": summary["drugScreens"],
            "appointments": summary["appointments"],
            "unreadReports": summary["unreadReports"],
        },
    )


@router.get("/employees", response_model=EmployeeListResponse)
def list_employees_endpoint(
    current_user: Current,
    category: str | None = Query(None),
    search: str | None = Query(None),
    from_date: str | None = Query(None, alias="from"),
    to_date: str | None = Query(None, alias="to"),
):
    """
    Unique PatientIds from CheckInsHeader for CheckInDate range + employer,
    joined to Patients (GenderId 1=Male, 2=Female). SELECT only.
    """
    from app.db.clinic import get_clinic_by_activation_key

    profile = _require_employer(current_user)
    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )

    items = list_employer_employees(
        clinic,
        employer_id=profile.employer_id,
        from_date=from_date,
        to_date=to_date,
        category=category,
        search=search,
    )
    return EmployeeListResponse(
        employerId=profile.employer_id,
        count=len(items),
        items=items,
    )
