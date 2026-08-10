from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse

from app.auth.dependencies import CurrentUser, get_current_user
from app.patient.appointments import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    list_upcoming_appointments,
)
from app.patient.schemas import (
    PatientDashboardSummaryResponse,
    PatientUpcomingAppointmentsResponse,
    PatientVisitDetailResponse,
    PatientVisitListResponse,
)
from app.patient.service import (
    default_visit_date_range,
    get_dashboard_summary,
    list_dashboard_visits,
)
from app.patient.visit_detail import (
    get_visit_detail,
    open_visit_document_file,
    open_visit_document_thumbnail,
)

router = APIRouter(prefix="/api/patient", tags=["patient"])


@router.get("/dashboard/summary", response_model=PatientDashboardSummaryResponse)
def patient_dashboard_summary_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """
    Last-30-day KPI counts for the logged-in patient:
    Urgent Care, Personal Injury, Physicals, Injury, upcoming appointments,
    unread shared reports.
    """
    return get_dashboard_summary(current_user)


@router.get("/dashboard/visits", response_model=PatientVisitListResponse)
def patient_dashboard_visits_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    category: str = Query(
        ...,
        description="KPI tab: urgentCare | personalInjury | physicals | injury",
    ),
    from_date: date | None = Query(default=None, alias="fromDate"),
    to_date: date | None = Query(default=None, alias="toDate"),
    search: str | None = Query(default=None),
):
    """
    Visit rows for the logged-in patient filtered by VisitTypes.CategoryId.

    Read-only SELECTs on CheckInsHeader, VisitTypes, Providers, Locations,
    AppointmentResources, EHRWorkStatuses, DocterPublishes.
    Defaults to the last 30 days when fromDate/toDate are omitted.
    """
    default_from, default_to = default_visit_date_range()
    return list_dashboard_visits(
        current_user,
        category=category,
        from_date=from_date or default_from,
        to_date=to_date or default_to,
        search=search,
    )


@router.get(
    "/appointments/upcoming",
    response_model=PatientUpcomingAppointmentsResponse,
)
def patient_upcoming_appointments_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(
        default=DEFAULT_PAGE_SIZE,
        ge=1,
        le=MAX_PAGE_SIZE,
        alias="pageSize",
    ),
):
    """
    Upcoming schedules for the logged-in patient (SELECT only).

    Tables: AppointmentSchedules, Appointments, CheckInsHeader, VisitTypes,
    AppointmentResources, Providers, Locations.
    """
    return list_upcoming_appointments(
        current_user,
        page=page,
        page_size=page_size,
    )


@router.get("/visits/{check_in_id}", response_model=PatientVisitDetailResponse)
def patient_visit_detail_endpoint(
    check_in_id: int,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """
    Selected visit detail for the logged-in patient (SELECT only):
    demographics, visit fields, published documents, and other visits.
    """
    return get_visit_detail(current_user, check_in_id)


@router.get("/visits/{check_in_id}/documents/{document_id}/file")
def patient_visit_document_file_endpoint(
    check_in_id: int,
    document_id: int,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> FileResponse:
    """Stream a DocterPublishes PDF owned by this patient's check-in."""
    return open_visit_document_file(current_user, check_in_id, document_id)


@router.get("/visits/{check_in_id}/documents/{document_id}/thumbnail")
def patient_visit_document_thumbnail_endpoint(
    check_in_id: int,
    document_id: int,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """PNG of the first PDF page for patient visit document tiles."""
    return open_visit_document_thumbnail(current_user, check_in_id, document_id)
