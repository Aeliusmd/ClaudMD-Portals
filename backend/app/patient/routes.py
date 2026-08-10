from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse

from app.auth.dependencies import CurrentUser, get_current_user
from app.employer.schemas import (
    AppointmentLocationOption,
    AppointmentPrepareResponse,
    AppointmentProviderOption,
    AppointmentSlotsResponse,
    AppointmentVisitTypeOption,
)
from app.patient.appointments import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    list_appointments,
    list_upcoming_appointments,
)
from app.patient.booking import (
    book_appointment,
    list_available_slots,
    list_booking_locations,
    list_booking_visit_types,
    list_providers_for_date,
)
from app.patient.schemas import (
    PatientAppointmentBookRequest,
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
    return list_upcoming_appointments(
        current_user,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/appointments",
    response_model=PatientUpcomingAppointmentsResponse,
)
def patient_appointments_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    scope: str = Query(
        default="all",
        description="all | upcoming | completed",
    ),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(
        default=DEFAULT_PAGE_SIZE,
        ge=1,
        le=MAX_PAGE_SIZE,
        alias="pageSize",
    ),
):
    """Patient appointments table — live schedules for All / Upcoming / Completed."""
    return list_appointments(
        current_user,
        scope=scope,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/appointments/locations",
    response_model=list[AppointmentLocationOption],
)
def patient_appointment_locations_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Clinic locations available for patient self-booking (SELECT only)."""
    return list_booking_locations(current_user)


@router.get(
    "/appointments/visit-types",
    response_model=list[AppointmentVisitTypeOption],
)
def patient_appointment_visit_types_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Urgent Care + Personal Injury visit types only (SELECT only)."""
    return list_booking_visit_types(current_user)


@router.get(
    "/appointments/providers",
    response_model=list[AppointmentProviderOption],
)
def patient_appointment_providers_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    location_id: int = Query(alias="locationId"),
    on_date: date = Query(alias="date"),
):
    """
    Providers/resources with shifts on the selected date + location (SELECT only).
    Same logic as employer portal.
    """
    return list_providers_for_date(
        current_user,
        location_id=location_id,
        on_date=on_date,
    )


@router.get("/appointments/slots", response_model=AppointmentSlotsResponse)
def patient_appointment_slots_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    location_id: int = Query(alias="locationId"),
    resource_id: int = Query(alias="resourceId"),
    on_date: date = Query(alias="date"),
    duration_minutes: int = Query(
        default=15, ge=1, le=480, alias="durationMinutes"
    ),
):
    """Available start slots for a provider on a date (SELECT only)."""
    return list_available_slots(
        current_user,
        location_id=location_id,
        resource_id=resource_id,
        on_date=on_date,
        duration_minutes=duration_minutes,
    )


@router.post("/appointments/book", response_model=AppointmentPrepareResponse)
def patient_appointment_book_endpoint(
    payload: PatientAppointmentBookRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """
    Book an Urgent Care / Personal Injury appointment for the logged-in patient.
    INSERTs into AppointmentRecurrings, Appointments, AppointmentSchedules only.
    """
    return book_appointment(current_user, payload)


@router.get("/visits/{check_in_id}", response_model=PatientVisitDetailResponse)
def patient_visit_detail_endpoint(
    check_in_id: int,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    return get_visit_detail(current_user, check_in_id)


@router.get("/visits/{check_in_id}/documents/{document_id}/file")
def patient_visit_document_file_endpoint(
    check_in_id: int,
    document_id: int,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> FileResponse:
    return open_visit_document_file(current_user, check_in_id, document_id)


@router.get("/visits/{check_in_id}/documents/{document_id}/thumbnail")
def patient_visit_document_thumbnail_endpoint(
    check_in_id: int,
    document_id: int,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    return open_visit_document_thumbnail(current_user, check_in_id, document_id)
