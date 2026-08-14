from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse

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
from app.employer.billing import get_bill_invoice, list_bill_review
from app.employer.employee_search import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    default_search_date_range,
    search_employees,
)
from app.validation.text import sanitize_search_query
from app.employer.notifications import (
    DEFAULT_PAGE_SIZE as NOTIF_DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE as NOTIF_MAX_PAGE_SIZE,
    list_notifications,
    mark_notifications_read,
)
from app.employer.billing import list_paid_bills
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
    BillInvoiceDetail,
    BillReviewResponse,
    DashboardSummaryResponse,
    EmployeeSearchResponse,
    EmployeeVisitsResponse,
    EmployerProfileResponse,
    MarkNotificationsReadResponse,
    NotificationsResponse,
    OrganizationUserAccessUpdateRequest,
    OrganizationUserAccessUpdateResponse,
    OrganizationUsersResponse,
    PaidBillsResponse,
    SharedDocumentDetailResponse,
    SupportClinicInfoResponse,
    SupportMessageDetail,
    SupportMessagesResponse,
    SupportRecipientsResponse,
    SupportSendResponse,
    UpcomingAppointmentsResponse,
    EmployerProfileUpdateRequest,
)
from app.employer.service import (
    get_dashboard_summary,
    get_employer_profile,
    update_employer_profile,
)
from app.employer.shared_documents import (
    get_shared_document_detail,
    open_shared_document_file,
    open_shared_document_thumbnail,
)
from app.employer.support import (
    get_support_clinic_info,
    get_support_message,
    list_support_messages,
    list_support_recipients,
    send_support_message,
)
from app.employer.visit_documents import get_employee_visits, open_employee_visit_document_file, open_employee_visit_document_thumbnail

router = APIRouter(prefix="/api/employer", tags=["employer"])


@router.get("/me", response_model=EmployerProfileResponse)
def employer_profile_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    return get_employer_profile(current_user)


@router.patch("/me", response_model=EmployerProfileResponse)
def employer_profile_update_endpoint(
    payload: EmployerProfileUpdateRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """
    Update editable profile fields on UserProfiles + EmployerContacts.
    LoginId / TypeId / organization / address are not changed.
    Does not write notifications or AuditLogEntries.
    """
    return update_employer_profile(current_user, payload)


@router.get("/organization-users", response_model=OrganizationUsersResponse)
def employer_organization_users_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """
    Organization contacts with roles from TypeId + UserGroupId.
    Admin when UserGroupId = 11; otherwise User for company contacts.
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

    Allowed for employer admins (UserProfiles.UserGroupId = 11) only.
    Updates EmployerContacts.IsAllowPortalAccess (+ portal-access row).
    AuditLogEntries writes are NOT implemented yet (permissions activity log only;
    never used as the in-app notification feed).
    """
    return update_organization_user_access(
        current_user,
        contact_id,
        payload.access_level,
    )


@router.get("/notifications", response_model=NotificationsResponse)
def employer_notifications_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(
        default=NOTIF_DEFAULT_PAGE_SIZE,
        ge=1,
        le=NOTIF_MAX_PAGE_SIZE,
        alias="pageSize",
    ),
):
    """
    In-app notification feed (SELECT only) for the last 30 days, paginated.
    Sources: SharedDocuments, employer appointments, EHRWorkStatuses.
    Does not read AuditLogEntries or dbo.Notification.
    """
    return list_notifications(current_user, page=page, page_size=page_size)


@router.post(
    "/notifications/mark-read",
    response_model=MarkNotificationsReadResponse,
)
def employer_notifications_mark_read_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """
    Mark SharedDocuments.IsViewed = 1 for shares addressed to the current user.
    Call when the notification dropdown (or View all page) is opened.
    """
    try:
        return mark_notifications_read(current_user)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"mark-read failed: {type(exc).__name__}: {exc}",
        ) from exc


@router.get("/billing/paid", response_model=PaidBillsResponse)
def employer_paid_bills_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(alias="pageSize", ge=1, le=50)] = 10,
    search: Annotated[str | None, Query(max_length=100)] = None,
):
    """
    Paid invoices for the current employer (SELECT only).
    Source: BillingOrderPayments + BillingHeadersHistory + order descriptions.
    """
    return list_paid_bills(
        current_user,
        page=page,
        page_size=page_size,
        search=(search or "").strip(),
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
    Also returns upcoming-appointment count and unread notification count.
    """
    return get_dashboard_summary(current_user)


@router.get("/billing/review", response_model=BillReviewResponse)
def employer_billing_review_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """
    Bill Review queue: Physical-category visit bills for the logged-in employer.
    SELECT-only. No schema changes.
    """
    return list_bill_review(current_user)


@router.get(
    "/billing/review/{billing_header_id}/invoice",
    response_model=BillInvoiceDetail,
)
def employer_billing_invoice_endpoint(
    billing_header_id: int,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    history_id: Annotated[int | None, Query(alias="historyId", gt=0)] = None,
):
    """
    Client Services invoice detail for one bill (SELECT-only).
    Scoped to the logged-in employer.
    """
    return get_bill_invoice(current_user, billing_header_id, history_id=history_id)


@router.get(
    "/employees/{patient_id}/visits",
    response_model=EmployeeVisitsResponse,
)
def employer_employee_visits_endpoint(
    patient_id: int,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    from_date: date | None = Query(default=None, alias="fromDate"),
    to_date: date | None = Query(default=None, alias="toDate"),
    category: str | None = Query(default=None),
):
    """
    Visits for a patient under the logged-in employer, with documents from
    dbo.DocterPublishes (one or many per check-in). SELECT only.
    Defaults to last 30 days (same window as dashboard KPI counts).
    Optional category (injury / physicals / drugScreens) filters the visit table only.
    """
    return get_employee_visits(
        current_user,
        patient_id,
        from_date=from_date,
        to_date=to_date,
        category=category,
    )


@router.get(
    "/shared-documents/by-shared-id/{shared_id}",
    response_model=SharedDocumentDetailResponse,
)
def employer_shared_document_detail_endpoint(
    shared_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """
    Resolve a secure share link: SharedDocuments.SharedId → DocumentId →
    DocumentUploads metadata (employee / visit / report).
    """
    return get_shared_document_detail(current_user, shared_id)


@router.get("/shared-documents/by-shared-id/{shared_id}/file")
def employer_shared_document_file_endpoint(
    shared_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> FileResponse:
    """Stream the PDF from DocumentUploads.FilePath for a SharedId link."""
    return open_shared_document_file(current_user, shared_id)


@router.get("/shared-documents/by-shared-id/{shared_id}/thumbnail")
def employer_shared_document_thumbnail_endpoint(
    shared_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """PNG of page 1 for a SharedId document tile."""
    return open_shared_document_thumbnail(current_user, shared_id)


@router.get("/employees/{patient_id}/visit-documents/{document_id}/file")
def employer_employee_visit_document_file_endpoint(
    patient_id: int,
    document_id: int,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> FileResponse:
    """Stream a DocterPublishes PDF from the clinic publish share (read-only)."""
    return open_employee_visit_document_file(
        current_user,
        patient_id,
        document_id,
    )


@router.get("/employees/{patient_id}/visit-documents/{document_id}/thumbnail")
def employer_employee_visit_document_thumbnail_endpoint(
    patient_id: int,
    document_id: int,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """PNG of the first PDF page for employee visit document tiles."""
    return open_employee_visit_document_thumbnail(
        current_user,
        patient_id,
        document_id,
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
        search=sanitize_search_query(search),
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
    patient_id: int | None = Query(default=None, alias="patientId"),
):
    """
    Available start slots for a provider on a date (SELECT only).
    Honors working hours, TimeSlot size, NumberOfPatientsPerSlot, and existing bookings.
    Duration longer than one slot requires contiguous free neighbor slots.
    When patientId is provided, also excludes times the patient already holds.
    """
    return list_available_slots(
        current_user,
        location_id=location_id,
        resource_id=resource_id,
        on_date=on_date,
        duration_minutes=duration_minutes,
        patient_id=patient_id,
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


@router.get("/support/clinic", response_model=SupportClinicInfoResponse)
def employer_support_clinic_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Support compose context (logged-in user as From)."""
    return get_support_clinic_info(current_user)


@router.get("/support/recipients", response_model=SupportRecipientsResponse)
def employer_support_recipients_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    search: str | None = Query(default=None),
):
    """Clinic staff users available for To / CC (internal messaging)."""
    return list_support_recipients(current_user, search=search)


@router.get("/support/messages", response_model=SupportMessagesResponse)
def employer_support_messages_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50, alias="pageSize"),
):
    """Inbox of MailInboxes rows for the logged-in employer user."""
    return list_support_messages(current_user, page=page, page_size=page_size)


@router.get("/support/messages/{message_id}", response_model=SupportMessageDetail)
def employer_support_message_detail_endpoint(
    message_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    return get_support_message(current_user, message_id)


@router.post("/support/messages", response_model=SupportSendResponse)
async def employer_support_send_endpoint(
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
