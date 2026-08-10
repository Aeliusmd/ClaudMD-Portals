from pydantic import BaseModel, Field


class PatientProfileResponse(BaseModel):
    user_id: int | None = None
    patient_id: int | None = None
    full_name: str
    first_name: str | None = None
    last_name: str | None = None
    date_of_birth: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    login_id: str | None = None
    type_id: int | None = None
    type_label: str | None = None


class PatientProfileUpdateRequest(BaseModel):
    """Editable patient portal profile fields (UserProfiles + linked Patients)."""

    full_name: str = Field(..., min_length=1, max_length=101)
    date_of_birth: str | None = Field(default=None, max_length=32)
    email: str = Field(..., min_length=1, max_length=100)
    phone: str | None = Field(default=None, max_length=20)
    address: str | None = Field(default=None, max_length=500)


class PatientInsuranceInfo(BaseModel):
    carrier: str | None = None
    policy_number: str | None = None
    group_number: str | None = None
    plan_type: str | None = None
    effective_date: str | None = None


class PatientEmployerInfo(BaseModel):
    name: str | None = None
    department: str | None = None


class PatientInformationResponse(BaseModel):
    """Read-only My Information aggregate (no writes)."""

    patient_id: int | None = None
    full_name: str
    date_of_birth: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    emergency_contact: str | None = None
    insurance: PatientInsuranceInfo
    employer: PatientEmployerInfo


class PatientNotificationItem(BaseModel):
    id: str
    message: str
    created_at: str | None = None
    time_ago: str = ""
    unread: bool = False
    href: str | None = None
    source: str
    source_id: int


class PatientNotificationsResponse(BaseModel):
    items: list[PatientNotificationItem] = []
    total: int = 0
    unread_count: int = 0
    page: int = 1
    page_size: int = 10
    total_pages: int = 1
    days: int = 30
    patient_id: int | None = None


class PatientMarkNotificationsReadResponse(BaseModel):
    updated_count: int = 0
    patient_id: int | None = None


class PatientDashboardSummaryResponse(BaseModel):
    urgent_care: int = 0
    personal_injury: int = 0
    physicals: int = 0
    injury: int = 0
    appointments: int = 0
    unread_reports: int = 0
    days: int = 30
    patient_id: int | None = None


class PatientVisitRow(BaseModel):
    id: str
    check_in_id: int
    category: str
    provider: str
    location: str
    date: str | None = None
    date_value: str | None = None
    work_status: str | None = None
    document_count: int = 0
    visit_type: str | None = None


class PatientVisitListResponse(BaseModel):
    items: list[PatientVisitRow] = Field(default_factory=list)
    total: int = 0
    category: str
    from_date: str | None = None
    to_date: str | None = None
    patient_id: int | None = None


class PatientVisitDocument(BaseModel):
    id: int
    check_in_id: int
    report_id: int | None = None
    report_name: str
    name: str
    path: str | None = None
    preview_badge: str
    preview_label: str
    is_completed: bool = False


class PatientVisitOtherRow(BaseModel):
    id: str
    check_in_id: int
    category: str | None = None
    provider: str | None = None
    location: str | None = None
    date: str | None = None
    date_value: str | None = None
    status: str | None = None


class PatientVisitPatientInfo(BaseModel):
    patient_id: int
    full_name: str
    date_of_birth: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    address_lines: list[str] = Field(default_factory=list)
    insurance_name: str | None = None
    insurance_plan: str | None = None
    employer_name: str | None = None
    employer_department: str | None = None


class PatientVisitDetailResponse(BaseModel):
    id: str
    check_in_id: int
    patient_id: int
    category: str
    provider: str
    location: str
    date: str | None = None
    date_value: str | None = None
    status: str | None = None
    work_status: str | None = None
    restrictions: str | None = None
    follow_up: str | None = None
    special_instructions: str | None = None
    visit_type: str | None = None
    show_employer: bool = True
    show_insurance: bool = True
    show_work_status: bool = True
    patient: PatientVisitPatientInfo
    documents: list[PatientVisitDocument] = Field(default_factory=list)
    other_visits: list[PatientVisitOtherRow] = Field(default_factory=list)


class PatientUpcomingAppointmentRow(BaseModel):
    id: str
    schedule_id: int
    appointment_id: int | None = None
    doctor: str
    specialty: str | None = None
    type: str | None = None
    category: str | None = None
    location: str | None = None
    date: str | None = None
    date_value: str | None = None
    time: str | None = None
    status: str | None = None


class PatientUpcomingAppointmentsResponse(BaseModel):
    items: list[PatientUpcomingAppointmentRow] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 10
    total_pages: int = 1
    patient_id: int | None = None


class PatientAppointmentBookRequest(BaseModel):
    location_id: int
    resource_id: int
    visit_type_id: int
    date: str
    start_time: str
    duration_minutes: int
    appointment_status_id: int | None = 4
    schedule_type_id: int | None = 1
    note: str | None = None
