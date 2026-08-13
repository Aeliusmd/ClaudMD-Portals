from pydantic import BaseModel

from app.employer.schemas import SharedDocumentDetailResponse


class OutsiderProfileResponse(BaseModel):
    user_id: int | None = None
    full_name: str
    first_name: str | None = None
    last_name: str | None = None
    title: str | None = None
    email: str | None = None
    login_id: str | None = None
    type_id: int | None = None
    type_label: str | None = None


class SharedDocumentListResponse(BaseModel):
    items: list[SharedDocumentDetailResponse] = []
    total: int = 0


class MarkSharedDocumentViewedResponse(BaseModel):
    shared_id: str
    viewed: bool = True
