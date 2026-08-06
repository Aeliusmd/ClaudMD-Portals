from pydantic import BaseModel, Field


class InsuranceProfileResponse(BaseModel):
    user_id: int | None = None
    insurance_id: int | None = None
    insurance_contact_id: int | None = None
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


class InsuranceProfileUpdateRequest(BaseModel):
    """Editable UserProfiles / InsuranceContacts fields only (not org address)."""

    first_name: str = Field(..., min_length=1, max_length=50)
    last_name: str = Field(default="", max_length=50)
    title: str | None = Field(default=None, max_length=100)
    email: str = Field(..., min_length=1, max_length=100)
    phone: str | None = Field(default=None, max_length=20)


class InsuranceOrganizationUserRow(BaseModel):
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


class InsuranceOrganizationUsersResponse(BaseModel):
    insurance_id: int | None = None
    organization: str | None = None
    items: list[InsuranceOrganizationUserRow] = []
    total: int = 0
    can_manage_access: bool = False


class InsuranceNotificationItem(BaseModel):
    id: str
    message: str
    created_at: str | None = None
    time_ago: str = ""
    unread: bool = False
    href: str | None = None
    source: str
    source_id: int


class InsuranceNotificationsResponse(BaseModel):
    items: list[InsuranceNotificationItem] = []
    total: int = 0
    unread_count: int = 0
    page: int = 1
    page_size: int = 10
    total_pages: int = 1
    days: int = 30
    insurance_id: int | None = None


class InsuranceMarkNotificationsReadResponse(BaseModel):
    updated_count: int = 0
    insurance_id: int | None = None
