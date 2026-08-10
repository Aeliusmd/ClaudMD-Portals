from pydantic import BaseModel, Field


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
