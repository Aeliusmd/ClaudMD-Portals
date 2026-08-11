"""Read-only insurance portal patient lists (Workers Comp / Private)."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from math import ceil

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.db.clinic import get_clinic_by_activation_key, get_clinic_connection
from app.employer.shift_type import shift_type_label
from app.insurance.profile import fetch_profile_from_clinic
from app.insurance.schemas import (
    InsurancePatientSearchResponse,
    InsurancePatientSearchRow,
)

DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 50

# workers_comp → CheckInsHeader.EmployerId IS NOT NULL
# private     → CheckInsHeader.EmployerId IS NULL
COVERAGE_WORKERS_COMP = "workers_comp"
COVERAGE_PRIVATE = "private"


def search_patients(
    current_user: CurrentUser,
    from_date: date,
    to_date: date,
    *,
    coverage: str = COVERAGE_WORKERS_COMP,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    search: str | None = None,
) -> InsurancePatientSearchResponse:
    if from_date > to_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="From date must be on or before to date.",
        )

    coverage_key = (coverage or COVERAGE_WORKERS_COMP).strip().lower()
    if coverage_key in {"workerscomp", "workers-comp", "wc"}:
        coverage_key = COVERAGE_WORKERS_COMP
    if coverage_key in {"privateinsurance", "private-insurance"}:
        coverage_key = COVERAGE_PRIVATE
    if coverage_key not in {COVERAGE_WORKERS_COMP, COVERAGE_PRIVATE}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="coverage must be workers_comp or private.",
        )

    page = max(1, int(page or 1))
    page_size = min(MAX_PAGE_SIZE, max(1, int(page_size or DEFAULT_PAGE_SIZE)))

    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )

    profile = fetch_profile_from_clinic(clinic, current_user)
    if profile.insurance_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Insurance company not found for this user.",
        )

    total, rows = _fetch_patient_rows(
        clinic=clinic,
        insurance_id=profile.insurance_id,
        from_date=from_date,
        to_date=to_date,
        coverage=coverage_key,
        page=page,
        page_size=page_size,
        search=search,
    )
    total_pages = max(1, ceil(total / page_size)) if total else 1
    if total and page > total_pages:
        page = total_pages
        total, rows = _fetch_patient_rows(
            clinic=clinic,
            insurance_id=profile.insurance_id,
            from_date=from_date,
            to_date=to_date,
            coverage=coverage_key,
            page=page,
            page_size=page_size,
            search=search,
        )

    return InsurancePatientSearchResponse(
        items=rows,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages if total else 1,
        from_date=from_date.isoformat(),
        to_date=to_date.isoformat(),
        insurance_id=profile.insurance_id,
        coverage=coverage_key,
    )


def _employer_scope_sql(coverage: str) -> str:
    if coverage == COVERAGE_PRIVATE:
        return "AND ch.EmployerId IS NULL"
    return "AND ch.EmployerId IS NOT NULL"


def _fetch_patient_rows(
    *,
    clinic,
    insurance_id: int,
    from_date: date,
    to_date: date,
    coverage: str,
    page: int,
    page_size: int,
    search: str | None,
) -> tuple[int, list[InsurancePatientSearchRow]]:
    """Matching check-ins in range for this insurer (one row per visit)."""
    q = (search or "").strip()
    search_like = f"%{q.lower()}%"
    offset = (page - 1) * page_size
    employer_scope = _employer_scope_sql(coverage)

    search_sql = ""
    search_params: list = []
    if q:
        search_sql = """
              AND (
                    LOWER(CONCAT(ISNULL(p.FirstName, ''), ' ', ISNULL(p.LastName, ''))) LIKE ?
                 OR LOWER(ISNULL(emp.Name, '')) LIKE ?
                 OR LOWER(CAST(ISNULL(inc.IncidentNumber, '') AS NVARCHAR(100))) LIKE ?
                 OR LOWER(CAST(ISNULL(p.AccountNumber, '') AS NVARCHAR(100))) LIKE ?
              )
        """
        search_params = [search_like, search_like, search_like, search_like]

    base_cte = f"""
            WITH FilteredCheckIns AS (
                SELECT
                    ch.Id AS CheckInId,
                    ch.PatientId,
                    ch.EmployerId,
                    ch.InsuranceId,
                    ch.IncidentId,
                    ch.CheckInDate,
                    ch.InjuryDate,
                    ch.InjuryTime,
                    ch.WorkStatusId,
                    ch.VisitTypeId
                FROM dbo.CheckInsHeader ch
                LEFT JOIN dbo.VisitTypes vt ON vt.Id = ch.VisitTypeId
                WHERE ch.InsuranceId = ?
                  {employer_scope}
                  AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
                  AND ch.PatientId IS NOT NULL
                  AND ch.CheckInDate IS NOT NULL
                  AND ch.CheckInDate >= ?
                  AND ch.CheckInDate <= ?
            )
    """

    count_sql = f"""
            {base_cte}
            SELECT COUNT(*) AS TotalCount
            FROM FilteredCheckIns r
            INNER JOIN dbo.Patients p ON p.Id = r.PatientId
            LEFT JOIN dbo.Incidents inc ON inc.Id = r.IncidentId
            LEFT JOIN dbo.Employers emp ON emp.Id = r.EmployerId
            WHERE (p.IsDeleted = 0 OR p.IsDeleted IS NULL)
              {search_sql}
    """

    page_sql = f"""
            {base_cte}
            SELECT
                r.CheckInId,
                r.PatientId,
                r.CheckInDate,
                r.InjuryDate,
                r.InjuryTime,
                r.IncidentId,
                r.WorkStatusId,
                ews.CurrentWorkShiftTypeId,
                ews.NextWorkShiftTypeId,
                p.AccountNumber,
                p.LastName,
                p.FirstName,
                p.DateOfBirth,
                p.GenderId,
                p.CellPhone,
                p.HomePhone,
                p.WorkPhone,
                p.Email,
                p.Address1,
                p.Address2,
                p.City,
                p.State,
                p.ZipCode,
                vt.Description AS VisitTypeDescription,
                vt.Code AS VisitTypeCode,
                vt.CategoryId AS VisitCategoryId,
                inc.IncidentNumber,
                ins.Name AS InsuranceName,
                emp.Name AS EmployerName
            FROM FilteredCheckIns r
            INNER JOIN dbo.Patients p ON p.Id = r.PatientId
            LEFT JOIN dbo.VisitTypes vt ON vt.Id = r.VisitTypeId
            LEFT JOIN dbo.Incidents inc ON inc.Id = r.IncidentId
            LEFT JOIN dbo.Insurances ins ON ins.Id = r.InsuranceId
            LEFT JOIN dbo.Employers emp ON emp.Id = r.EmployerId
            OUTER APPLY (
                SELECT TOP 1
                    ws.CurrentWorkShiftTypeId,
                    ws.NextWorkShiftTypeId
                FROM dbo.EHRWorkStatuses ws
                INNER JOIN dbo.CheckInsHeader ch ON ch.Id = ws.CheckInId
                WHERE ch.PatientId = r.PatientId
                  AND (ws.IsDeleted = 0 OR ws.IsDeleted IS NULL)
                  AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
                ORDER BY
                    CASE WHEN ws.CheckInId = r.CheckInId THEN 0 ELSE 1 END,
                    CASE WHEN ch.InsuranceId = r.InsuranceId THEN 0 ELSE 1 END,
                    ch.CheckInDate DESC,
                    ws.Id DESC
            ) ews
            WHERE (p.IsDeleted = 0 OR p.IsDeleted IS NULL)
              {search_sql}
            ORDER BY r.CheckInDate DESC, p.LastName, p.FirstName
            OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
    """

    base_params = [int(insurance_id), from_date, to_date]
    filter_params = base_params + search_params

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(count_sql, tuple(filter_params))
        total = int(cursor.fetchone()[0] or 0)

        cursor.execute(page_sql, tuple(filter_params + [offset, page_size]))
        columns = [col[0] for col in cursor.description]
        db_rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

    coverage_label = (
        "Workers Comp" if coverage == COVERAGE_WORKERS_COMP else "Private Insurance"
    )
    items = [_map_patient_row(row, coverage_label) for row in db_rows]
    return total, items


def _map_patient_row(row: dict, coverage_label: str) -> InsurancePatientSearchRow:
    patient_id = int(row["PatientId"])
    check_in_id = int(row["CheckInId"])
    account_no = row.get("AccountNumber")
    account_str = str(account_no) if account_no is not None else None

    first = (row.get("FirstName") or "").strip()
    last = (row.get("LastName") or "").strip()
    full_name = " ".join(part for part in [first, last] if part).strip() or "Unknown"

    category = _visit_category(row.get("VisitCategoryId"), row.get("VisitTypeCode"))
    # Workers Comp injuries are VisitTypes.CategoryId = 1 → "Injury".
    # Never show the private-patient "Personal Injury" label on WC rows.
    if coverage_label == "Workers Comp" and category == "Personal Injury":
        category = "Injury"

    incident_number = row.get("IncidentNumber")
    incident_display = (
        str(incident_number) if incident_number is not None else "N/A"
    )

    phone = (
        (row.get("CellPhone") or "").strip()
        or (row.get("HomePhone") or "").strip()
        or (row.get("WorkPhone") or "").strip()
        or None
    )

    address_parts = [
        (row.get("Address1") or "").strip(),
        (row.get("Address2") or "").strip(),
        (row.get("City") or "").strip(),
        (row.get("State") or "").strip(),
        (row.get("ZipCode") or "").strip(),
    ]
    address = ", ".join(part for part in address_parts if part) or None

    current_shift = row.get("CurrentWorkShiftTypeId")
    if current_shift is None:
        current_shift = row.get("WorkStatusId")
    next_shift = row.get("NextWorkShiftTypeId")

    return InsurancePatientSearchRow(
        id=str(patient_id),
        patient_id=patient_id,
        check_in_id=check_in_id,
        coverage=coverage_label,
        patient_name=full_name,
        employer_name=row.get("EmployerName"),
        insurance_company=row.get("InsuranceName"),
        account_no=account_str,
        incident_id=int(row["IncidentId"]) if row.get("IncidentId") is not None else None,
        incident_number=incident_display,
        category=category,
        last_visit=_format_display_date(row.get("CheckInDate")),
        last_visit_value=_format_date_iso(row.get("CheckInDate")),
        work_status=shift_type_label(current_shift) or "—",
        disability_status=shift_type_label(next_shift),
        date_of_birth=_format_display_date(row.get("DateOfBirth")),
        gender=_gender_label(row.get("GenderId")),
        phone=phone,
        email=(row.get("Email") or "").strip() or None,
        address=address,
    )


def _visit_category(category_id: int | None, code: str | None) -> str | None:
    """Map VisitTypes to portal display labels (aligned with patient portal buckets)."""
    normalized = (code or "").strip().upper()
    if normalized == "PDS":
        return "Drug Screen"
    try:
        cid = int(category_id) if category_id is not None else None
    except (TypeError, ValueError):
        cid = None
    if cid == 1:
        return "Injury"
    if cid == 2:
        return "Physical"
    if cid == 3:
        return "Urgent Care"
    if cid == 4:
        return "Personal Injury"
    return None


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


def _format_date_iso(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _format_display_date(value) -> str | None:
    iso = _format_date_iso(value)
    if not iso:
        return None
    try:
        parsed = datetime.strptime(iso, "%Y-%m-%d")
        return parsed.strftime("%b %d, %Y")
    except ValueError:
        return iso


def default_search_date_range() -> tuple[date, date]:
    today = date.today()
    return today - timedelta(days=30), today
