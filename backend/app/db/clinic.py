from __future__ import annotations

from dataclasses import dataclass

import pyodbc

from app.config import get_settings
from app.db.connection import build_mssql_connection_string


@dataclass(frozen=True)
class ClinicConnectionInfo:
    clinic_id: int
    clinic_name: str
    database_server: str
    database_user: str
    database_password: str
    database_name: str
    activation_key: str
    active: bool


def get_master_connection() -> pyodbc.Connection:
    settings = get_settings()
    if not settings.master_db_configured:
        raise RuntimeError("Master database is not configured.")
    conn_str = build_mssql_connection_string(
        server=settings.master_db_server,
        database=settings.master_db_name,
        username=settings.master_db_user,
        password=settings.master_db_password,
        driver=settings.master_db_driver,
    )
    return pyodbc.connect(conn_str, timeout=15, autocommit=True)


def get_clinic_by_activation_key(activation_key: str) -> ClinicConnectionInfo | None:
    """Read clinic DB credentials from master ClinicSetup (SELECT only)."""
    key = (activation_key or "").strip()
    if not key:
        return None

    with get_master_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT TOP 1
                ClinicID,
                ClinicName,
                DatabaseServer,
                DatabaseUser,
                DatabasePassword,
                DatabaseName,
                ActivationKey,
                Active
            FROM dbo.ClinicSetup
            WHERE ActivationKey = ?
            """,
            (key,),
        )
        row = cursor.fetchone()
        if not row:
            return None

        return ClinicConnectionInfo(
            clinic_id=int(row.ClinicID),
            clinic_name=row.ClinicName or "",
            database_server=row.DatabaseServer,
            database_user=row.DatabaseUser,
            database_password=row.DatabasePassword,
            database_name=row.DatabaseName,
            activation_key=str(row.ActivationKey),
            active=bool(row.Active),
        )


def get_clinic_connection(clinic: ClinicConnectionInfo) -> pyodbc.Connection:
    conn_str = build_mssql_connection_string(
        server=clinic.database_server,
        database=clinic.database_name,
        username=clinic.database_user,
        password=clinic.database_password,
    )
    return pyodbc.connect(conn_str, timeout=15, autocommit=True)
