from typing import Annotated

from fastapi import APIRouter, Depends

from app.auth.dependencies import CurrentUser, get_current_user
from app.employer.schemas import EmployerProfileResponse
from app.employer.service import get_employer_profile

router = APIRouter(prefix="/api/employer", tags=["employer"])


@router.get("/me", response_model=EmployerProfileResponse)
def employer_profile_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    return get_employer_profile(current_user)
