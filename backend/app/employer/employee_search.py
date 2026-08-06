from __future__ import annotations

from datetime import date, datetime, time, timedelta
from math import ceil

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.db.clinic import get_clinic_by_activation_key, get_clinic_connection
from app.employer.schemas import EmployeeSearchResponse, EmployeeSearchRow
from app.employer.profile import fetch_profile_from_clinic
from app.employer.shift_type import shift_type_label

DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 50


def search_employees(
    current_user: CurrentUser,
    from_date: date,
    to_date: date,
    *,
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
    search: str | None = None,
    category: str | None = None,
    patient_id: int | None = None,
) -> EmployeeSearchResponse:
    if from_date > to_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="From date must be on or before to date.",
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
    if profile.employer_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employer not found for this user.",
        )

    total, rows = _fetch_employee_rows(
        clinic=clinic,
        employer_id=profile.employer_id,
        from_date=from_date,
        to_date=to_date,
        organization=profile.organization,
        page=page,
        page_size=page_size,
        search=search,
        category=category,
        patient_id=patient_id,
    )
    total_pages = max(1, ceil(total / page_size)) if total else 1
    if total and page > total_pages:
        page = total_pages
        total, rows = _fetch_employee_rows(
            clinic=clinic,
            employer_id=profile.employer_id,
            from_date=from_date,
            to_date=to_date,
            organization=profile.organization,
            page=page,
            page_size=page_size,
            search=search,
            category=category,
            patient_id=patient_id,
        )

    return EmployeeSearchResponse(
        items=rows,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages if total else 1,
        from_date=from_date.isoformat(),
        to_date=to_date.isoformat(),
        employer_id=profile.employer_id,
    )


def _category_sql_clause(category: str | None) -> tuple[str, list]:
    cat = (category or "").strip().lower()
    if not cat:
        return "", []
    if cat in {"injury"}:
        return "AND vt.CategoryId = 1", []
    if cat in {"physicals", "physical"}:
        return (
            "AND vt.CategoryId = 2 AND UPPER(LTRIM(RTRIM(ISNULL(vt.Code, '')))) <> 'PDS'",
            [],
        )
    if cat in {"drugscreens", "drug_screens", "drug-screen", "drugscreen"}:
        return "AND UPPER(LTRIM(RTRIM(ISNULL(vt.Code, '')))) = 'PDS'", []
    return "", []


def _fetch_employee_rows(
    *,
    clinic,
    employer_id: int,
    from_date: date,
    to_date: date,
    organization: str | None,
    page: int,
    page_size: int,
    search: str | None,
    category: str | None,
    patient_id: int | None,
) -> tuple[int, list[EmployeeSearchRow]]:
    """Read-only: unique patients (one row each) with latest matching check-in in range."""
    q = (search or "").strip()
    search_like = f"%{q.lower()}%"
    category_sql, _ = _category_sql_clause(category)
    offset = (page - 1) * page_size

    patient_filter_sql = ""
    patient_params: list = []
    if patient_id is not None:
        patient_filter_sql = "AND r.PatientId = ?"
        patient_params.append(int(patient_id))

    search_sql = ""
    search_params: list = []
    if q:
        search_sql = """
              AND (
                    LOWER(CONCAT(ISNULL(p.FirstName, ''), ' ', ISNULL(p.LastName, ''))) LIKE ?
                 OR LOWER(CAST(ISNULL(p.AccountNumber, '') AS NVARCHAR(100))) LIKE ?
                 OR LOWER(CAST(ISNULL(inc.IncidentNumber, '') AS NVARCHAR(100))) LIKE ?
                 OR LOWER(CAST(ISNULL(p.SSN, '') AS NVARCHAR(100))) LIKE ?
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
                WHERE ch.EmployerId = ?
                  AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
                  AND ch.CheckInDate IS NOT NULL
                  AND ch.CheckInDate >= ?
                  AND ch.CheckInDate <= ?
                  {category_sql}
            ),
            Ranked AS (
                SELECT *,
                    ROW_NUMBER() OVER (
                        PARTITION BY PatientId
                        ORDER BY CheckInDate DESC, CheckInId DESC
                    ) AS rn
                FROM FilteredCheckIns
            )
    """

    count_sql = f"""
            {base_cte}
            SELECT COUNT(*) AS TotalCount
            FROM Ranked r
            INNER JOIN dbo.Patients p ON p.Id = r.PatientId
            LEFT JOIN dbo.VisitTypes vt ON vt.Id = r.VisitTypeId
            LEFT JOIN dbo.Incidents inc ON inc.Id = r.IncidentId
            WHERE r.rn = 1
              AND (p.IsDeleted = 0 OR p.IsDeleted IS NULL)
              {patient_filter_sql}
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
                p.Id AS PatientTableId,
                p.AccountNumber,
                p.SSN,
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
            FROM Ranked r
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
                    CASE WHEN ch.EmployerId = r.EmployerId THEN 0 ELSE 1 END,
                    ch.CheckInDate DESC,
                    ws.Id DESC
            ) ews
            WHERE r.rn = 1
              AND (p.IsDeleted = 0 OR p.IsDeleted IS NULL)
              {patient_filter_sql}
              {search_sql}
            ORDER BY r.CheckInDate DESC, p.LastName, p.FirstName
            OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
    """

    base_params = [employer_id, from_date, to_date]
    filter_params = base_params + patient_params + search_params

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(count_sql, tuple(filter_params))
        total = int(cursor.fetchone()[0] or 0)

        cursor.execute(page_sql, tuple(filter_params + [offset, page_size]))
        columns = [col[0] for col in cursor.description]
        db_rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

    items = [_map_employee_row(row, organization) for row in db_rows]
    return total, items


def _map_employee_row(row: dict, organization: str | None) -> EmployeeSearchRow:
    patient_id = int(row["PatientId"])
    check_in_id = int(row["CheckInId"])
    account_no = row.get("AccountNumber")
    account_str = str(account_no) if account_no is not None else None

    first = (row.get("FirstName") or "").strip()
    last = (row.get("LastName") or "").strip()
    full_name = " ".join(part for part in [first, last] if part).strip() or "Unknown"

    ssn = (row.get("SSN") or "").strip() or None
    ssn_digits = "".join(ch for ch in ssn if ch.isdigit()) if ssn else ""
    ssn_last4 = ssn_digits[-4:] if len(ssn_digits) >= 4 else None

    category = _visit_category(row.get("VisitCategoryId"), row.get("VisitTypeCode"))
    report_type = row.get("VisitTypeDescription") or row.get("VisitTypeCode") or "Status Report"

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

    check_in_iso = _format_date_iso(row.get("CheckInDate"))

    # Prefer EHRWorkStatuses.CurrentWorkShiftTypeId; fall back to header WorkStatusId.
    current_shift = row.get("CurrentWorkShiftTypeId")
    if current_shift is None:
        current_shift = row.get("WorkStatusId")
    next_shift = row.get("NextWorkShiftTypeId")

    return EmployeeSearchRow(
        id=f"{patient_id}-{check_in_id}",
        patient_id=patient_id,
        check_in_id=check_in_id,
        employee_id=str(patient_id),
        employee_name=full_name,
        account_no=account_str,
        ssn=ssn,
        ssn_last4=ssn_last4,
        employer_name=row.get("EmployerName") or organization,
        insurance_company=row.get("InsuranceName"),
        report_type=report_type,
        category=category,
        check_in_date=_format_display_date(row.get("CheckInDate")),
        check_in_date_value=check_in_iso,
        incident_id=int(row["IncidentId"]) if row.get("IncidentId") is not None else None,
        incident_number=incident_display,
        date_of_injury=_format_display_date(row.get("InjuryDate")),
        time_of_injury=_format_time_display(row.get("InjuryTime")),
        work_status=shift_type_label(current_shift),
        disability_status=shift_type_label(next_shift),
        unread_report_count=0,
        appointment_count=0,
        date_of_birth=_format_display_date(row.get("DateOfBirth")),
        gender_id=int(row["GenderId"]) if row.get("GenderId") is not None else None,
        gender=_gender_label(row.get("GenderId")),
        phone=phone,
        email=(row.get("Email") or "").strip() or None,
        address=address,
        city=(row.get("City") or "").strip() or None,
        state=(row.get("State") or "").strip() or None,
        zip_code=(row.get("ZipCode") or "").strip() or None,
    )


def _visit_category(category_id: int | None, code: str | None) -> str | None:
    normalized = (code or "").strip().upper()
    if normalized == "PDS":
        return "Drug Screen"
    if category_id == 1:
        return "Injury"
    if category_id == 2:
        return "Physical"
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


def _format_time_display(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        value = value.time()
    if isinstance(value, time):
        return value.strftime("%I:%M %p").lstrip("0")
    return str(value)


def default_search_date_range() -> tuple[date, date]:
    today = date.today()
    return today - timedelta(days=30), today
