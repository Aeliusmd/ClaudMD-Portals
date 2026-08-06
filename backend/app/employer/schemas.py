from pydantic import BaseModel


class EmployerProfileResponse(BaseModel):
    user_id: int | None = None
    employer_id: int | None = None
    employer_contact_id: int | None = None
    full_name: str
    title: str | None = None
    email: str | None = None
    phone: str | None = None
    organization: str | None = None
    address: str | None = None
    login_id: str | None = None
    type_id: int | None = None
    type_label: str | None = None


class DashboardSummaryResponse(BaseModel):
    injury: int = 0
    physicals: int = 0
    drug_screens: int = 0
    appointments: int = 0
    days: int = 30
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


class AppointmentPrepareRequest(BaseModel):
    patient_id: int | None = None
    new_patient: NewPatientPayload | None = None
    location_id: int
    resource_id: int
    visit_type_id: int
    date: str
    start_time: str
    duration_minutes: int
    appointment_status_id: int | None = 4
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
    recurring_id: int | None = None
    appointment_id: int | None = None
    schedule_id: int | None = None
