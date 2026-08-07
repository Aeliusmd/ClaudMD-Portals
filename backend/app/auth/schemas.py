from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, description="Email or login id")
    password: str = Field(..., min_length=1)
    activation_key: str = Field(..., min_length=1, alias="activationKey")
    """Optional portal the user is signing into (employer | patient | insurance)."""
    portal: str | None = Field(
        default=None,
        description="Expected portal from the login page: employer, patient, or insurance.",
    )

    model_config = {
        "populate_by_name": True,
    }


class UserInfo(BaseModel):
    id: int | None = None
    login_id: str
    email: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    name: str | None = None
    portal: str = "employer"
    type_id: int | None = None
    type_label: str | None = None
    activation_key: str | None = None


class ClinicInfo(BaseModel):
    id: int | None = None
    name: str | None = None
    activation_key: str
    database_name: str | None = None
    active: bool | None = None


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None
    expires_in: int | None = None
    token_type: str = "Bearer"
    scope: str | None = None
    user: UserInfo
    clinic: ClinicInfo | None = None


class ClinicResolveResponse(BaseModel):
    activation_key: str
    clinic_id: int
    clinic_name: str
    database_name: str
    active: bool


class ErrorResponse(BaseModel):
    detail: str


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, alias="currentPassword")
    new_password: str = Field(..., min_length=1, alias="newPassword")
    confirm_password: str = Field(..., min_length=1, alias="confirmPassword")

    model_config = {
        "populate_by_name": True,
    }


class ChangePasswordResponse(BaseModel):
    message: str
