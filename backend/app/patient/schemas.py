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
