from pydantic import BaseModel, Field, field_validator

from app.validation.contact import email_error, phone_error
from app.validation.text import unsafe_markup_error


class EmployerProfileResponse(BaseModel):
    user_id: int | None = None
    employer_id: int | None = None
    employer_contact_id: int | None = None
    full_name: str
    first_name: str | None = None
    last_name: str | None = None
    title: str | None = None
    email: str | None = None
    phone: str | None = None
    organization: str | None = None
    address: str | None = None
    login_id: str | None = None
    type_id: int | None = None
    type_label: str | None = None
    user_group_id: int | None = None
    is_admin: bool = False
    activation_key: str | None = None
    database_name: str | None = None


class EmployerProfileUpdateRequest(BaseModel):
    """Editable UserProfiles / EmployerContacts fields only (not org address)."""

    first_name: str = Field(..., min_length=1, max_length=50)
    last_name: str = Field(default="", max_length=50)
    title: str | None = Field(default=None, max_length=100)
    email: str = Field(..., min_length=1, max_length=100)
    phone: str | None = Field(default=None, max_length=20)

    @field_validator("first_name", "last_name", "title")
    @classmethod
    def _reject_unsafe_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        err = unsafe_markup_error(cleaned)
        if err:
            raise ValueError(err)
        return cleaned

    @field_validator("email")
    @classmethod
    def _validate_email(cls, value: str) -> str:
        err = email_error(value, required=True)
        if err:
            raise ValueError(err)
        return value.strip()

    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip() or None
        err = phone_error(cleaned, required=False)
        if err:
            raise ValueError(err)
        return cleaned


class DashboardSummaryResponse(BaseModel):
    injury: int = 0
    physicals: int = 0
    drug_screens: int = 0
    appointments: int = 0
    unread_reports: int = 0
    days: int = 30
    employer_id: int | None = None


class NotificationItem(BaseModel):
    id: str
    message: str
    created_at: str | None = None
    time_ago: str = ""
    unread: bool = False
    href: str | None = None
    source: str
    source_id: int


class NotificationsResponse(BaseModel):
    items: list[NotificationItem] = []
    total: int = 0
    unread_count: int = 0
    page: int = 1
    page_size: int = 10
    total_pages: int = 1
    days: int = 30
    employer_id: int | None = None


class MarkNotificationsReadResponse(BaseModel):
    updated_count: int = 0
    employer_id: int | None = None


class EmployeeSearchRow(BaseModel):
    id: str
    patient_id: int
    check_in_id: int
    employee_id: str
    employee_name: str
    account_no: str | None = None
    ssn: str | None = None
    ssn_last4: str | None = None
    employer_name: str | None = None
    insurance_company: str | None = None
    report_type: str | None = None
    visit_type: str | None = None
    category: str | None = None
    check_in_date: str | None = None
    check_in_date_value: str | None = None
    incident_id: int | None = None
    incident_number: str | None = None
    date_of_injury: str | None = None
    time_of_injury: str | None = None
    work_status: str | None = None
    disability_status: str | None = None
    unread_report_count: int = 0
    appointment_count: int = 0
    date_of_birth: str | None = None
    gender_id: int | None = None
    gender: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None


class EmployeeSearchResponse(BaseModel):
    items: list[EmployeeSearchRow]
    total: int
    page: int = 1
    page_size: int = 10
    total_pages: int = 1
    from_date: str
    to_date: str
    employer_id: int | None = None


class UpcomingAppointmentRow(BaseModel):
    id: str
    schedule_id: int
    appointment_id: int | None = None
    patient_id: int | None = None
    employee_id: str | None = None
    employee_name: str
    category: str | None = None
    visit_type: str | None = None
    provider: str | None = None
    clinic: str | None = None
    date: str | None = None
    date_value: str | None = None
    time: str | None = None
    status: str | None = None
    appointment_status_id: int | None = None


class UpcomingAppointmentsResponse(BaseModel):
    items: list[UpcomingAppointmentRow]
    total: int
    page: int = 1
    page_size: int = 10
    total_pages: int = 1
    employer_id: int | None = None


class VisitDocumentPreviousVersion(BaseModel):
    id: int
    published_at: str | None = None
    version_tag: str | None = None
    path: str | None = None


class EmployeeVisitDocument(BaseModel):
    id: int
    check_in_id: int
    report_id: int | None = None
    report_name: str
    name: str
    path: str | None = None
    preview_badge: str
    preview_label: str
    is_completed: bool = False
    published_at: str | None = None
    version_tag: str | None = None
    previous_versions: list[VisitDocumentPreviousVersion] = Field(default_factory=list)


class EmployeeVisitRecord(BaseModel):
    visit_id: str
    check_in_id: int | None = None
    is_upcoming: bool = False
    check_in_date: str | None = None
    check_in_date_value: str | None = None
    visit_label: str | None = None
    category: str | None = None
    documents: list[EmployeeVisitDocument] = []
    schedule_id: int | None = None
    appointment_id: int | None = None
    time: str | None = None
    end_time: str | None = None
    provider: str | None = None
    clinic: str | None = None
    status: str | None = None
    duration_minutes: int | None = None
    note: str | None = None


class EmployeeVisitsResponse(BaseModel):
    patient_id: int
    employer_id: int | None = None
    from_date: str
    to_date: str
    visits: list[EmployeeVisitRecord] = []


class AppointmentLocationOption(BaseModel):
    id: int
    name: str
    short_name: str | None = None


class AppointmentVisitTypeOption(BaseModel):
    id: int
    code: str | None = None
    name: str
    category_id: int | None = None


class AppointmentPatientOption(BaseModel):
    id: int
    name: str
    first_name: str | None = None
    last_name: str | None = None
    account_no: str | None = None
    ssn: str | None = None
    date_of_birth: str | None = None
    gender_id: int | None = None
    gender: str | None = None
    phone: str | None = None
    location_id: int | None = None


class AppointmentProviderOption(BaseModel):
    resource_id: int
    provider_id: int | None = None
    name: str
    resource_name: str | None = None
    provider_name: str | None = None
    location_id: int
    time_slot_minutes: float = 15
    patients_per_slot: int = 1
    shifts: list[dict] = []


class AppointmentSlotOption(BaseModel):
    start: str
    end: str
    label: str
    slots_used: int = 1


class AppointmentSlotsResponse(BaseModel):
    date: str
    location_id: int
    resource_id: int
    duration_minutes: int
    time_slot_minutes: int
    patients_per_slot: int
    slots_needed: int
    items: list[AppointmentSlotOption] = []


class NewPatientPayload(BaseModel):
    first_name: str
    last_name: str
    date_of_birth: str
    gender: str | None = None
    gender_id: int | None = None
    ssn: str | None = None
    account_no: str | None = None
    phone: str | None = None
    address1: str | None = None
    address2: str | None = None
    city: str | None = None
    state: str | None = None
    zip_code: str | None = None


class AppointmentPrepareRequest(BaseModel):
    patient_id: int | None = None
    new_patient: NewPatientPayload | None = None
    location_id: int
    resource_id: int
    visit_type_id: int
    date: str
    start_time: str
    duration_minutes: int
    appointment_status_id: int | None = 1
    schedule_type_id: int | None = 1
    note: str | None = None


class AppointmentPrepareResponse(BaseModel):
    executed: bool = False
    message: str
    sql_script: str | None = None
    draft_file: str | None = None
    employer_id: int | None = None
    location_id: int | None = None
    resource_id: int | None = None
    date: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    duration_minutes: int | None = None
    slots_needed: int | None = None
    time_slot_minutes: int | None = None
    warnings: list[str] = []
    patient_id: int | None = None
    patient_ssn: str | None = None
    recurring_id: int | None = None
    appointment_id: int | None = None
    schedule_id: int | None = None


class OrganizationUserRow(BaseModel):
    id: str
    contact_id: int
    user_id: int | None = None
    full_name: str
    email: str | None = None
    title: str | None = None
    login_id: str | None = None
    type_id: int | None = None
    type_label: str | None = None
    user_group_id: int | None = None
    is_admin: bool = False
    role: str
    access_level: str
    active: bool = True
    contact_type: str | None = None
    service_type: str | None = None
    has_portal_access_row: bool = False


class OrganizationUsersResponse(BaseModel):
    employer_id: int | None = None
    organization: str | None = None
    items: list[OrganizationUserRow] = []
    total: int = 0
    can_manage_access: bool = False


class SharedDocumentEmployee(BaseModel):
    patient_id: int | None = None
    name: str
    account_no: str | None = None
    date_of_birth: str | None = None
    gender: str | None = None
    phone: str | None = None
    address: str | None = None


class SharedDocumentDetailResponse(BaseModel):
    """Secure-link shared document resolved via SharedDocuments.SharedId."""

    shared_id: str
    document_id: int
    document_type: str
    report_title: str | None = None
    file_name: str | None = None
    visit_date: str | None = None
    visit_label: str | None = None
    check_in_id: int | None = None
    report_id: int | None = None
    published_at: str | None = None
    shared_at: str | None = None
    is_viewed: bool = False
    employee: SharedDocumentEmployee


class OrganizationUserAccessUpdateRequest(BaseModel):
    """Grant / modify / revoke portal access for an employer contact."""

    access_level: str = Field(
        ...,
        description="Portal Access or No Access",
    )


class OrganizationUserAccessUpdateResponse(BaseModel):
    item: OrganizationUserRow
    can_manage_access: bool = False


class SupportClinicInfoResponse(BaseModel):
    clinic_name: str
    clinic_email: str | None = None
    location_id: int | None = None
    can_send: bool = False
    smtp_configured: bool = False
    employer_id: int | None = None
    insurance_id: int | None = None
    patient_id: int | None = None
    from_email: str | None = None
    from_name: str | None = None
    from_user_id: int | None = None


class SupportUserRef(BaseModel):
    user_id: int
    full_name: str
    email: str | None = None
    display_label: str


class SupportRecipientRow(BaseModel):
    user_id: int
    full_name: str
    email: str | None = None
    login_id: str | None = None
    occupation: str | None = None
    display_label: str
    type_id: int | None = None


class SupportRecipientsResponse(BaseModel):
    items: list[SupportRecipientRow] = []
    total: int = 0
    clinic_name: str | None = None


class SupportAttachmentRow(BaseModel):
    id: int
    file_name: str
    mail_inbox_id: int | None = None


class SupportMessageRow(BaseModel):
    id: str
    subject: str
    category: str = "internal"
    category_label: str = "Internal"
    to_email: str | None = None
    from_email: str | None = None
    status: str
    created_at: str | None = None
    preview: str | None = None
    from_user: SupportUserRef | None = None
    to_user: SupportUserRef | None = None
    cc_labels: list[str] = []
    direction: str = "sent"
    is_seen: bool = False


class SupportMessageDetail(BaseModel):
    id: str
    subject: str
    body: str
    category: str = "internal"
    category_label: str = "Internal"
    to_email: str | None = None
    from_email: str | None = None
    from_name: str | None = None
    clinic_name: str | None = None
    organization: str | None = None
    status: str
    delivery_note: str | None = None
    created_at: str | None = None
    from_user: SupportUserRef | None = None
    to_user: SupportUserRef | None = None
    cc_users: list[SupportUserRef] = []
    attachments: list[SupportAttachmentRow] = []
    direction: str = "sent"
    is_seen: bool = False


class SupportMessagesResponse(BaseModel):
    items: list[SupportMessageRow]
    total: int
    page: int = 1
    page_size: int = 10
    total_pages: int = 1
    clinic_name: str | None = None
    clinic_email: str | None = None


class SupportSendRequest(BaseModel):
    """Legacy JSON body (kept for compatibility; multipart preferred)."""

    subject: str
    body: str
    category: str | None = None
    to_user_id: int | None = None
    cc_user_ids: list[int] = []


class SupportSendResponse(BaseModel):
    message: SupportMessageDetail
    delivery_status: str
    delivery_note: str | None = None


class PaidBillRow(BaseModel):
    id: str
    billing_header_id: int
    history_id: int
    invoice_no: str
    invoice_number: str | None = None
    dos: str | None = None
    account_no: str | None = None
    patient_name: str | None = None
    visit: str = "—"
    description: str
    category: str | None = None
    paid_on: str | None = None
    amount: float = 0
    status: str = "Paid"


class PaidBillsResponse(BaseModel):
    items: list[PaidBillRow] = []
    total: int = 0
    total_paid: float = 0
    employer_id: int | None = None
    # False when no Physical payments existed and all visit categories were returned.
    physical_only: bool = True
    page: int = 1
    page_size: int = 10
    total_pages: int = 1


class BillReviewRow(BaseModel):
    id: str
    billing_header_id: int
    history_id: int | None = None
    dos: str | None = None
    account_no: str | None = None
    patient_name: str
    visit: str
    amount: float = 0
    invoice_number: str | None = None


class BillReviewResponse(BaseModel):
    items: list[BillReviewRow] = []
    total: int = 0
    payable_count: int = 0
    outstanding_total: float = 0
    employer_id: int | None = None
    page: int = 1
    page_size: int = 10
    total_pages: int = 1


class BillInvoiceLine(BaseModel):
    id: int
    exam_date: str | None = None
    code: str | None = None
    description: str | None = None
    quantity: float = 1
    unit_price: float = 0
    charges: float = 0
    payment: float = 0
    adjust: float = 0
    balance: float = 0


class BillInvoiceDetail(BaseModel):
    billing_header_id: int
    history_id: int | None = None
    title: str = "CLIENT SERVICES BILLING"
    page_label: str = "Page 1 of 1"
    invoice_date: str | None = None
    invoice_number: str | None = None
    tax_id: str | None = None
    amount_due: float = 0
    due_date: str | None = None
    clinic_name: str | None = None
    clinic_address: str | None = None
    clinic_phone: str | None = None
    clinic_fax: str | None = None
    employer_name: str | None = None
    employer_address: str | None = None
    employer_phone: str | None = None
    patient_name: str | None = None
    patient_ssn: str | None = None
    account_no: str | None = None
    occupation: str | None = None
    diagnosis: list[str] = []
    provider_name: str | None = None
    lines: list[BillInvoiceLine] = []
    total_due: float = 0
    employer_id: int | None = None
