from fastapi import APIRouter, Query

from app.auth.schemas import ClinicResolveResponse, LoginRequest, LoginResponse
from app.auth.service import authenticate_user, resolve_clinic
from app.config import get_settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/clinic", response_model=ClinicResolveResponse)
def resolve_clinic_endpoint(
    activation_key: str | None = Query(default=None, alias="activationKey"),
):
    settings = get_settings()
    key = (activation_key or settings.default_activation_key).strip()
    clinic = resolve_clinic(key)
    return ClinicResolveResponse(
        activation_key=clinic.activation_key,
        clinic_id=clinic.clinic_id,
        clinic_name=clinic.clinic_name,
        database_name=clinic.database_name,
        active=clinic.active,
    )


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    return authenticate_user(payload)
