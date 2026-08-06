from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.auth.dependencies import CurrentUser, get_current_user
from app.employer.employee_search import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    default_search_date_range,
    search_employees,
)
from app.employer.schemas import (
    DashboardSummaryResponse,
    EmployeeSearchResponse,
    EmployeeVisitsResponse,
    EmployerProfileResponse,
    OrganizationUserAccessUpdateRequest,
    OrganizationUserAccessUpdateResponse,
    OrganizationUsersResponse,
)
from app.employer.service import get_dashboard_summary, get_employer_profile
from app.employer.permissions import (
    get_organization_users,
    update_organization_user_access,
)
from app.employer.visit_documents import get_employee_visits

router = APIRouter(prefix="/api/employer", tags=["employer"])


@router.get("/me", response_model=EmployerProfileResponse)
def employer_profile_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    return get_employer_profile(current_user)


@router.get("/organization-users", response_model=OrganizationUsersResponse)
def employer_organization_users_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """
    Display-only list of organization contacts with roles from UserType enum.
    """
    return get_organization_users(current_user)


@router.patch(
    "/organization-users/{contact_id}/access",
    response_model=OrganizationUserAccessUpdateResponse,
)
def employer_organization_user_access_endpoint(
    contact_id: int,
    payload: OrganizationUserAccessUpdateRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """
    Grant / modify / revoke portal access for an organization contact.

    Allowed for Super Admin (TypeId 0) only.
    Updates EmployerContacts.IsAllowPortalAccess (+ portal-access row).
    Audit log writes are NOT implemented yet.
    """
    return update_organization_user_access(
        current_user,
        contact_id,
        payload.access_level,
    )


@router.get("/dashboard/summary", response_model=DashboardSummaryResponse)
def employer_dashboard_summary_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """
    Last-30-day KPI counts from CheckInsHeader (SELECT only):
      injury      → VisitTypes.CategoryId = 1
      physicals   → VisitTypes.CategoryId = 2 AND Code <> 'PDS'
      drugScreens → VisitTypes.Code = 'PDS'
    """
    return get_dashboard_summary(current_user)


@router.get(
    "/employees/{patient_id}/visits",
    response_model=EmployeeVisitsResponse,
)
def employer_employee_visits_endpoint(
    patient_id: int,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    from_date: date | None = Query(default=None, alias="fromDate"),
    to_date: date | None = Query(default=None, alias="toDate"),
):
    """
    Visits for a patient under the logged-in employer, with documents from
    dbo.DocterPublishes (one or many per check-in). SELECT only.
    """
    return get_employee_visits(
        current_user,
        patient_id,
        from_date=from_date,
        to_date=to_date,
    )


@router.get("/employees/search", response_model=EmployeeSearchResponse)
def employer_employee_search_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    from_date: date | None = Query(default=None, alias="fromDate"),
    to_date: date | None = Query(default=None, alias="toDate"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(
        default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE, alias="pageSize"
    ),
    search: str | None = Query(default=None),
    category: str | None = Query(default=None),
    patient_id: int | None = Query(default=None, alias="patientId"),
):
    """
    Unique PatientIds from CheckInsHeader for CheckInDate range + employer,
    joined to Patients. Server-side pagination via page/pageSize.
    """
    default_from, default_to = default_search_date_range()
    start = from_date or default_from
    end = to_date or default_to
    return search_employees(
        current_user,
        start,
        end,
        page=page,
        page_size=page_size,
        search=search,
        category=category,
        patient_id=patient_id,
    )
