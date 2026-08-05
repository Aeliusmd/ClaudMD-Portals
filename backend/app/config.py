from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ClaudMD IdentityServer (password grant)
    identity_url: str = "https://qaidentity.claudmd.com"
    identity_client_id: str = "resource"
    identity_client_secret: str
    identity_scope: str = "openid profile app.api.resource offline_access"

    # Optional master DB — used only for read-only clinic metadata enrichment
    master_db_server: str | None = None
    master_db_name: str | None = None
    master_db_user: str | None = None
    master_db_password: str | None = None
    master_db_driver: str = "ODBC Driver 17 for SQL Server"

    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:3000"

    default_activation_key: str = "20000002"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def identity_token_url(self) -> str:
        return f"{self.identity_url.rstrip('/')}/connect/token"

    @property
    def master_db_configured(self) -> bool:
        return bool(
            self.master_db_server
            and self.master_db_name
            and self.master_db_user
            and self.master_db_password
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
