from app.config import get_settings


def build_mssql_connection_string(
    *,
    server: str,
    database: str,
    username: str,
    password: str,
    driver: str | None = None,
) -> str:
    settings = get_settings()
    odbc_driver = driver or settings.master_db_driver
    # pyodbc connection string — read-only usage at the application layer
    return (
        f"DRIVER={{{odbc_driver}}};"
        f"SERVER={server};"
        f"DATABASE={database};"
        f"UID={username};"
        f"PWD={password};"
        "TrustServerCertificate=yes;"
    )
