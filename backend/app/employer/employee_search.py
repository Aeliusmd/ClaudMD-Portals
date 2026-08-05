from __future__ import annotations

from datetime import date, datetime, time, timedelta

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.db.clinic import get_clinic_by_activation_key, get_clinic_connection
from app.employer.schemas import EmployeeSearchResponse, EmployeeSearchRow
from app.employer.service import _fetch_profile_from_clinic


def search_employees(
    current_user: CurrentUser,
    from_date: date,
    to_date: date,
) -> EmployeeSearchResponse:
    if from_date > to_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="From date must be on or before to date.",
        )

    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )

    profile = _fetch_profile_from_clinic(clinic, current_user)
    if profile.employer_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employer not found for this user.",
        )

    rows = _fetch_employee_rows(
        clinic=clinic,
        employer_id=profile.employer_id,
        from_date=from_date,
        to_date=to_date,
        organization=profile.organization,
    )

    return EmployeeSearchResponse(
        items=rows,
        total=len(rows),
        from_date=from_date.isoformat(),
        to_date=to_date.isoformat(),
        employer_id=profile.employer_id,
    )


def _fetch_employee_rows(
    *,
    clinic,
    employer_id: int,
    from_date: date,
    to_date: date,
    organization: str | None,
) -> list[EmployeeSearchRow]:
    """Read-only: unique patients with latest check-in in range."""
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
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
                WHERE ch.EmployerId = ?
                  AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
                  AND ch.CheckInDate IS NOT NULL
                  AND ch.CheckInDate >= ?
                  AND ch.CheckInDate <= ?
            ),
            Ranked AS (
                SELECT *,
                    ROW_NUMBER() OVER (
                        PARTITION BY PatientId
                        ORDER BY CheckInDate DESC, CheckInId DESC
                    ) AS rn
                FROM FilteredCheckIns
            )
            SELECT
                r.CheckInId,
                r.PatientId,
                r.CheckInDate,
                r.InjuryDate,
                r.InjuryTime,
                r.IncidentId,
                r.WorkStatusId,
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
            WHERE r.rn = 1
              AND (p.IsDeleted = 0 OR p.IsDeleted IS NULL)
            ORDER BY r.CheckInDate DESC, p.LastName, p.FirstName
            """,
            (employer_id, from_date, to_date),
        )
        columns = [col[0] for col in cursor.description]
        db_rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

    items: list[EmployeeSearchRow] = []
    for row in db_rows:
        items.append(_map_employee_row(row, organization))

    return items


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
        work_status=None,
        disability_status=None,
        unread_report_count=0,
        appointment_count=0,
        date_of_birth=_format_display_date(row.get("DateOfBirth")),
        gender_id=int(row["GenderId"]) if row.get("GenderId") is not None else None,
        phone=phone,
        email=(row.get("Email") or "").strip() or None,
        address=address,
        city=(row.get("City") or "").strip() or None,
        state=(row.get("State") or "").strip() or None,
        zip_code=(row.get("ZipCode") or "").strip() or None,
    )


def _visit_category(category_id: int | None, code: str | None) -> str | None:
    if category_id == 1:
        return "Injury"
    if category_id == 2:
        if (code or "").upper() == "PDS":
            return "Physical"
        return "Physical"
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
