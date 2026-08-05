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
    login_id: str | None = None


class DashboardSummaryResponse(BaseModel):
    employerId: int
    employerName: str | None = None
    fromDate: str
    toDate: str
    last30Days: dict


class EmployeeListResponse(BaseModel):
    employerId: int
    count: int
    items: list[dict]
