from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.auth.dependencies import CurrentUser, get_current_user
from app.employer.appointments import (
    DEFAULT_PAGE_SIZE as APPT_DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE as APPT_MAX_PAGE_SIZE,
    list_upcoming_appointments,
)
from app.employer.booking import (
    book_appointment,
    list_available_slots,
    list_booking_locations,
    list_booking_patients,
    list_booking_visit_types,
    list_providers_for_date,
)
from app.employer.employee_search import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    default_search_date_range,
    search_employees,
)
from app.employer.permissions import (
    get_organization_users,
    update_organization_user_access,
)
from app.employer.schemas import (
    AppointmentLocationOption,
    AppointmentPatientOption,
    AppointmentPrepareRequest,
    AppointmentPrepareResponse,
    AppointmentProviderOption,
    AppointmentSlotsResponse,
    AppointmentVisitTypeOption,
    DashboardSummaryResponse,
    EmployeeSearchResponse,
    EmployeeVisitsResponse,
    EmployerProfileResponse,
    OrganizationUserAccessUpdateRequest,
    OrganizationUserAccessUpdateResponse,
    OrganizationUsersResponse,
    UpcomingAppointmentsResponse,
)
from app.employer.service import get_dashboard_summary, get_employer_profile
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
    Also returns upcoming-appointment count for this employer.
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


@router.get("/appointments/upcoming", response_model=UpcomingAppointmentsResponse)
def employer_upcoming_appointments_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(
        default=APPT_DEFAULT_PAGE_SIZE,
        ge=1,
        le=APPT_MAX_PAGE_SIZE,
        alias="pageSize",
    ),
):
    """
    Upcoming appointments (SELECT only): AppointmentSchedules from today onward
    for this employer via Appointments.EmployerId or CheckInsHeader.EmployerId.
    """
    return list_upcoming_appointments(
        current_user,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/appointments/locations",
    response_model=list[AppointmentLocationOption],
)
def employer_appointment_locations_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Clinic locations for booking (SELECT only)."""
    return list_booking_locations(current_user)


@router.get(
    "/appointments/visit-types",
    response_model=list[AppointmentVisitTypeOption],
)
def employer_appointment_visit_types_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Visit types for booking (SELECT only)."""
    return list_booking_visit_types(current_user)


@router.get(
    "/appointments/patients",
    response_model=list[AppointmentPatientOption],
)
def employer_appointment_patients_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    search: str | None = Query(default=None),
):
    """Patients/employees already linked to this employer (SELECT only)."""
    return list_booking_patients(current_user, search=search)


@router.get(
    "/appointments/providers",
    response_model=list[AppointmentProviderOption],
)
def employer_appointment_providers_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    location_id: int = Query(alias="locationId"),
    on_date: date = Query(alias="date"),
):
    """
    Providers/resources with shifts on the selected date + location (SELECT only).
    Uses AppointmentResources + AppointmentResourceShifts.
    """
    return list_providers_for_date(
        current_user,
        location_id=location_id,
        on_date=on_date,
    )


@router.get(
    "/appointments/slots",
    response_model=AppointmentSlotsResponse,
)
def employer_appointment_slots_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    location_id: int = Query(alias="locationId"),
    resource_id: int = Query(alias="resourceId"),
    on_date: date = Query(alias="date"),
    duration_minutes: int = Query(default=15, ge=1, le=480, alias="durationMinutes"),
):
    """
    Available start slots for a provider on a date (SELECT only).
    Honors working hours, TimeSlot size, NumberOfPatientsPerSlot, and existing bookings.
    Duration longer than one slot requires contiguous free neighbor slots.
    """
    return list_available_slots(
        current_user,
        location_id=location_id,
        resource_id=resource_id,
        on_date=on_date,
        duration_minutes=duration_minutes,
    )


@router.post(
    "/appointments/book",
    response_model=AppointmentPrepareResponse,
)
@router.post(
    "/appointments/prepare",
    response_model=AppointmentPrepareResponse,
)
def employer_appointment_book_endpoint(
    payload: AppointmentPrepareRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """
    Book an appointment: SELECT validation, then INSERT into existing tables only
    (Patients optional, AppointmentRecurrings, Appointments, AppointmentSchedules).
    No schema changes.
    """
    return book_appointment(current_user, payload)
