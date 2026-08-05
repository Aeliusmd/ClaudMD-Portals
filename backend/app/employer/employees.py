"""Employer employee search — unique PatientIds from CheckInsHeader + Patients."""

from __future__ import annotations

from datetime import date, datetime

from app.db.clinic import ClinicConnectionInfo, get_clinic_connection
from app.employer.dashboard import (
    DRUG_SCREEN_CODE,
    INJURY_CATEGORY_ID,
    PHYSICAL_CATEGORY_ID,
    last_30_day_window,
)


def _gender_label(gender_id) -> str | None:
    if gender_id is None:
        return None
    try:
        gid = int(gender_id)
    except (TypeError, ValueError):
        return None
    if gid == 1:
        return "Male"
    if gid == 2:
        return "Female"
    return None


def _fmt_date(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)[:10]


def list_employer_employees(
    clinic: ClinicConnectionInfo,
    *,
    employer_id: int,
    from_date: str | None = None,
    to_date: str | None = None,
    category: str | None = None,
    search: str | None = None,
) -> list[dict]:
    """
    Distinct PatientIds from CheckInsHeader for EmployerId + CheckInDate range,
    joined to Patients. Optional KPI category filter:
      injury / physicals → VisitTypes.CategoryId 1 / 2 (physical excludes PDS)
      drugscreens → VisitTypes.Code = 'PDS'
    """
    start_default, end_default = last_30_day_window()
    start = from_date or start_default.isoformat()
    end = to_date or end_default.isoformat()
    cat = (category or "").strip().lower() or None
    q = (search or "").strip()
    search_like = f"%{q.lower()}%"

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            WITH ranked AS (
              SELECT
                h.PatientId,
                h.Id AS CheckInId,
                h.IncidentId,
                h.CheckInDate,
                h.VisitTypeId,
                vt.Code AS VisitCode,
                vt.Description AS VisitDescription,
                vt.CategoryId,
                ROW_NUMBER() OVER (
                  PARTITION BY h.PatientId
                  ORDER BY h.CheckInDate DESC, h.Id DESC
                ) AS rn
              FROM dbo.CheckInsHeader h
              INNER JOIN dbo.VisitTypes vt ON vt.Id = h.VisitTypeId
              WHERE h.EmployerId = ?
                AND ISNULL(h.IsDeleted, 0) = 0
                AND h.PatientId IS NOT NULL
                AND h.CheckInDate IS NOT NULL
                AND CAST(h.CheckInDate AS DATE) >= ?
                AND CAST(h.CheckInDate AS DATE) <= ?
                AND (
                      ? IS NULL
                   OR (? = 'injury' AND vt.CategoryId = ?)
                   OR (
                        ? = 'physicals'
                    AND vt.CategoryId = ?
                    AND UPPER(LTRIM(RTRIM(ISNULL(vt.Code, '')))) <> ?
                   )
                   OR (
                        ? = 'drugscreens'
                    AND UPPER(LTRIM(RTRIM(ISNULL(vt.Code, '')))) = ?
                   )
                )
            )
            SELECT
              r.PatientId,
              r.CheckInId,
              r.IncidentId,
              r.CheckInDate,
              r.VisitTypeId,
              r.VisitCode,
              r.VisitDescription,
              r.CategoryId,
              p.AccountNumber,
              p.FirstName,
              p.LastName,
              p.SSN,
              p.DateOfBirth,
              p.GenderId,
              p.Email,
              p.CellPhone,
              p.City,
              p.State,
              i.IncidentNumber
            FROM ranked r
            INNER JOIN dbo.Patients p ON p.Id = r.PatientId
            LEFT JOIN dbo.Incidents i ON i.Id = r.IncidentId
            WHERE r.rn = 1
              AND ISNULL(p.IsDeleted, 0) = 0
              AND (
                    ? = ''
                 OR LOWER(CONCAT(ISNULL(p.FirstName, ''), ' ', ISNULL(p.LastName, ''))) LIKE ?
                 OR LOWER(CAST(ISNULL(p.AccountNumber, '') AS NVARCHAR(100))) LIKE ?
                 OR LOWER(CAST(ISNULL(i.IncidentNumber, '') AS NVARCHAR(100))) LIKE ?
              )
            ORDER BY r.CheckInDate DESC, p.LastName, p.FirstName
            """,
            (
                employer_id,
                start,
                end,
                cat,
                cat,
                INJURY_CATEGORY_ID,
                cat,
                PHYSICAL_CATEGORY_ID,
                DRUG_SCREEN_CODE,
                cat,
                DRUG_SCREEN_CODE,
                q.lower(),
                search_like,
                search_like,
                search_like,
            ),
        )
        rows = cursor.fetchall()

    results: list[dict] = []
    for row in rows:
        category_id = row.CategoryId
        code = (row.VisitCode or "").strip().upper()
        if code == DRUG_SCREEN_CODE:
            category_label = "Drug Screen"
            is_drug = True
        elif category_id == INJURY_CATEGORY_ID:
            category_label = "Injury"
            is_drug = False
        elif category_id == PHYSICAL_CATEGORY_ID:
            category_label = "Physical"
            is_drug = False
        else:
            category_label = row.VisitDescription or "Other"
            is_drug = False

        first = (row.FirstName or "").strip()
        last = (row.LastName or "").strip()
        name = f"{first} {last}".strip() or f"Patient {row.PatientId}"
        check_in = _fmt_date(row.CheckInDate)

        results.append(
            {
                "id": str(row.CheckInId),
                "employee": name,
                "employeeId": str(row.PatientId),
                "patientId": str(row.PatientId),
                "accountNumber": row.AccountNumber,
                "incidentNumber": row.IncidentNumber or "N/A",
                "category": category_label,
                "lastVisit": check_in,
                "lastVisitValue": check_in,
                "workStatus": "—",
                "unreadReportCount": 0,
                "isDrugScreen": is_drug,
                "gender": _gender_label(row.GenderId),
                "dateOfBirth": _fmt_date(row.DateOfBirth),
                "email": row.Email,
                "cellPhone": row.CellPhone,
                "city": row.City,
                "state": row.State,
                "ssn": row.SSN,
            }
        )

    return results
