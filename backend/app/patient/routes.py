from __future__ import annotations

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
from app.patient.notifications import (
    DEFAULT_PAGE_SIZE as NOTIF_DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE as NOTIF_MAX_PAGE_SIZE,
    list_notifications,
    mark_notifications_read,
)
from app.patient.schemas import (
    PatientDashboardSummaryResponse,
    PatientInformationResponse,
    PatientMarkNotificationsReadResponse,
    PatientNotificationsResponse,
    PatientProfileResponse,
    PatientProfileUpdateRequest,
    PatientUpcomingAppointmentsResponse,
    PatientVisitDetailResponse,
    PatientVisitListResponse,
)
from app.patient.service import (
    default_visit_date_range,
    get_dashboard_summary,
    get_my_information,
    get_patient_profile,
    list_dashboard_visits,
    update_patient_profile,
)
from app.patient.visit_detail import (
    get_visit_detail,
    open_visit_document_file,
    open_visit_document_thumbnail,
)

router = APIRouter(prefix="/api/patient", tags=["patient"])


@router.get("/me", response_model=PatientProfileResponse)
def patient_profile_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Logged-in Patient User profile (UserProfiles + Patients via activation-key clinic)."""
    return get_patient_profile(current_user)


@router.patch("/me", response_model=PatientProfileResponse)
def patient_profile_update_endpoint(
    payload: PatientProfileUpdateRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """
    Update editable profile fields on UserProfiles + linked Patients.
    LoginId / TypeId are not changed.
    """
    return update_patient_profile(current_user, payload)


@router.get("/me/information", response_model=PatientInformationResponse)
def patient_my_information_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """
    Read-only My Information: personal, insurance, and employer details.
    Does not write to the clinic database.
    """
    return get_my_information(current_user)


@router.get("/notifications", response_model=PatientNotificationsResponse)
def patient_notifications_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    page: Annotated[int, Query(ge=1)] = 1,
    pageSize: Annotated[int, Query(ge=1, le=NOTIF_MAX_PAGE_SIZE)] = NOTIF_DEFAULT_PAGE_SIZE,
):
    """
    Patient notification feed (shared docs, appointments, visit/work status)
    for the linked patient chart over the last 30 days.
    """
    return list_notifications(current_user, page=page, page_size=pageSize)


@router.post(
    "/notifications/mark-read",
    response_model=PatientMarkNotificationsReadResponse,
)
def patient_notifications_mark_read_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Mark shared documents addressed to this patient user as viewed."""
    return mark_notifications_read(current_user)


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
