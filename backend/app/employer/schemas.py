from pydantic import BaseModel, Field


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
    check_in_id: int
    check_in_date: str | None = None
    check_in_date_value: str | None = None
    visit_label: str | None = None
    category: str | None = None
    documents: list[EmployeeVisitDocument] = []


class EmployeeVisitsResponse(BaseModel):
    patient_id: int
    employer_id: int | None = None
    from_date: str
    to_date: str
    visits: list[EmployeeVisitRecord] = []


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


class OrganizationUserAccessUpdateRequest(BaseModel):
    """Grant / modify / revoke portal access for an employer contact."""

    access_level: str = Field(
        ...,
        description="Portal Access or No Access",
    )


class OrganizationUserAccessUpdateResponse(BaseModel):
    item: OrganizationUserRow
    can_manage_access: bool = False

