from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import FileResponse

from app.auth.dependencies import CurrentUser, get_current_user
from app.validation.text import sanitize_search_query
from app.employer.schemas import (
    AppointmentLocationOption,
    AppointmentPrepareResponse,
    AppointmentProviderOption,
    AppointmentSlotsResponse,
    AppointmentVisitTypeOption,
    SharedDocumentDetailResponse,
    SupportClinicInfoResponse,
    SupportMessageDetail,
    SupportMessagesResponse,
    SupportRecipientsResponse,
    SupportSendResponse,
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
from app.patient.notifications import (
    DEFAULT_PAGE_SIZE as NOTIF_DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE as NOTIF_MAX_PAGE_SIZE,
    list_notifications,
    mark_notifications_read,
)
from app.patient.schemas import (
    PatientAppointmentBookRequest,
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
from app.patient.shared_documents import (
    get_shared_document_detail,
    open_shared_document_file,
    open_shared_document_thumbnail,
)
from app.patient.support import (
    get_support_clinic_info,
    get_support_message,
    list_support_messages,
    list_support_recipients,
    send_support_message,
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
        search=sanitize_search_query(search),
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


@router.get(
    "/shared-documents/by-shared-id/{shared_id}",
    response_model=SharedDocumentDetailResponse,
)
def patient_shared_document_detail_endpoint(
    shared_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """
    Resolve a secure share link for the logged-in patient: SharedId →
    DocumentUploads, only when the visit belongs to their own chart.
    """
    return get_shared_document_detail(current_user, shared_id)


@router.get("/shared-documents/by-shared-id/{shared_id}/file")
def patient_shared_document_file_endpoint(
    shared_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> FileResponse:
    """Stream the PDF from DocumentUploads.FilePath for a SharedId link."""
    return open_shared_document_file(current_user, shared_id)


@router.get("/shared-documents/by-shared-id/{shared_id}/thumbnail")
def patient_shared_document_thumbnail_endpoint(
    shared_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """PNG of page 1 for a SharedId document tile."""
    return open_shared_document_thumbnail(current_user, shared_id)


@router.get("/support/clinic", response_model=SupportClinicInfoResponse)
def patient_support_clinic_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Support compose context (logged-in user as From)."""
    return get_support_clinic_info(current_user)


@router.get("/support/recipients", response_model=SupportRecipientsResponse)
def patient_support_recipients_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    search: str | None = Query(default=None),
):
    """Clinic staff users available for To / CC (internal messaging)."""
    return list_support_recipients(current_user, search=search)


@router.get("/support/messages", response_model=SupportMessagesResponse)
def patient_support_messages_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50, alias="pageSize"),
):
    """Inbox of MailInboxes rows for the logged-in patient user."""
    return list_support_messages(current_user, page=page, page_size=page_size)


@router.get("/support/messages/{message_id}", response_model=SupportMessageDetail)
def patient_support_message_detail_endpoint(
    message_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    return get_support_message(current_user, message_id)


@router.post("/support/messages", response_model=SupportSendResponse)
async def patient_support_send_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    to_user_id: Annotated[int, Form(alias="toUserId")],
    subject: Annotated[str, Form()],
    body: Annotated[str, Form()],
    cc_user_ids: Annotated[str | None, Form(alias="ccUserIds")] = None,
    files: Annotated[list[UploadFile] | None, File()] = None,
):
    """
    Compose an internal support message into dbo.MailInboxes (+ attachments).
    Mother-style CC: one MailInboxes row per recipient (To = that user).
    No schema changes.
    """
    parsed_ccs: list[int] = []
    if cc_user_ids:
        for part in str(cc_user_ids).split(","):
            part = part.strip()
            if not part:
                continue
            try:
                parsed_ccs.append(int(part))
            except ValueError:
                continue

    return await send_support_message(
        current_user,
        to_user_id=to_user_id,
        cc_user_ids=parsed_ccs,
        subject=subject,
        body=body,
        files=list(files or []),
    )
