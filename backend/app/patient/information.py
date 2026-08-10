"""Read-only My Information for the patient portal."""

from __future__ import annotations

from datetime import date, datetime

from app.auth.dependencies import CurrentUser
from app.db.clinic import get_clinic_connection
from app.patient.profile import (
    _format_dob_iso,
    _format_patient_address,
    fetch_profile_from_clinic,
)
from app.patient.schemas import (
    PatientEmployerInfo,
    PatientInformationResponse,
    PatientInsuranceInfo,
)


def get_patient_information(clinic, current_user: CurrentUser) -> PatientInformationResponse:
    """
    Aggregate personal + insurance + employer details for My Information.
    SELECT only — does not write to any table.
    """
    profile = fetch_profile_from_clinic(clinic, current_user)
    patient_id = profile.patient_id

    emergency_contact = None
    insurance = PatientInsuranceInfo()
    employer = PatientEmployerInfo()

    if patient_id is not None:
        with get_clinic_connection(clinic) as conn:
            cursor = conn.cursor()
            emergency_contact = _fetch_emergency_contact(cursor, patient_id)
            insurance = _fetch_insurance(cursor, patient_id)
            employer = _fetch_employer(cursor, patient_id)

            # Prefer chart demographics when richer than UserProfiles-only fields.
            cursor.execute(
                """
                SELECT TOP 1
                    FirstName, LastName, Email, DateOfBirth,
                    CellPhone, HomePhone, WorkPhone,
                    Address1, Address2, City, State, ZipCode
                FROM dbo.Patients
                WHERE Id = ?
                  AND (IsDeleted = 0 OR IsDeleted IS NULL)
                """,
                (int(patient_id),),
            )
            patient_row = cursor.fetchone()

        if patient_row:
            first = (patient_row.FirstName or "").strip() or profile.first_name
            last = (patient_row.LastName or "").strip() or profile.last_name
            full_name = " ".join(
                part for part in [first, last] if part and str(part).strip()
            ).strip() or profile.full_name
            email = (patient_row.Email or "").strip() or profile.email
            phone = (
                (patient_row.CellPhone or "").strip()
                or (patient_row.HomePhone or "").strip()
                or (patient_row.WorkPhone or "").strip()
                or profile.phone
            )
            address = _format_patient_address(patient_row) or profile.address
            dob = _format_dob_iso(patient_row.DateOfBirth) or profile.date_of_birth
        else:
            full_name = profile.full_name
            email = profile.email
            phone = profile.phone
            address = profile.address
            dob = profile.date_of_birth
    else:
        full_name = profile.full_name
        email = profile.email
        phone = profile.phone
        address = profile.address
        dob = profile.date_of_birth

    return PatientInformationResponse(
        patient_id=patient_id,
        full_name=full_name,
        date_of_birth=dob,
        email=email,
        phone=phone,
        address=address,
        emergency_contact=emergency_contact,
        insurance=insurance,
        employer=employer,
    )


def _fetch_emergency_contact(cursor, patient_id: int) -> str | None:
    cursor.execute(
        """
        SELECT TOP 1 EmergencyContact, EmergencyContactNumber, RelationToPatient
        FROM dbo.Patients
        WHERE Id = ?
          AND (IsDeleted = 0 OR IsDeleted IS NULL)
        """,
        (int(patient_id),),
    )
    row = cursor.fetchone()
    if not row:
        return None
    name = (row.EmergencyContact or "").strip()
    phone = (row.EmergencyContactNumber or "").strip()
    if name and phone:
        return f"{name} — {phone}"
    return name or phone or None


def _fetch_insurance(cursor, patient_id: int) -> PatientInsuranceInfo:
    cursor.execute(
        """
        SELECT TOP 1
            pi.Carrier,
            pi.MemberNumber,
            pi.GroupNumber,
            pi.PlanName,
            pi.HealthPlan,
            pi.Coverage,
            pi.EffectiveDate,
            ins.Name AS InsuranceName
        FROM dbo.PatientInsurances pi
        LEFT JOIN dbo.Insurances ins
            ON ins.Id = pi.InsuranceId
           AND (ins.IsDeleted = 0 OR ins.IsDeleted IS NULL)
        WHERE pi.PatientId = ?
          AND (pi.IsDeleted = 0 OR pi.IsDeleted IS NULL)
        ORDER BY
            CASE WHEN pi.EffectiveDate IS NULL THEN 1 ELSE 0 END,
            pi.EffectiveDate DESC,
            pi.Id DESC
        """,
        (int(patient_id),),
    )
    row = cursor.fetchone()
    if not row:
        # Fallback: latest check-in insurer name only.
        cursor.execute(
            """
            SELECT TOP 1 ins.Name AS InsuranceName
            FROM dbo.CheckInsHeader ch
            LEFT JOIN dbo.Insurances ins ON ins.Id = ch.InsuranceId
            WHERE ch.PatientId = ?
              AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
              AND ch.InsuranceId IS NOT NULL
            ORDER BY ch.CheckInDate DESC, ch.Id DESC
            """,
            (int(patient_id),),
        )
        fallback = cursor.fetchone()
        carrier = (
            ((fallback.InsuranceName or "").strip() or None) if fallback else None
        )
        return PatientInsuranceInfo(carrier=carrier)

    carrier = (
        (row.Carrier or "").strip()
        or (row.InsuranceName or "").strip()
        or None
    )
    plan_type = (
        (row.PlanName or "").strip()
        or (row.HealthPlan or "").strip()
        or (row.Coverage or "").strip()
        or None
    )
    return PatientInsuranceInfo(
        carrier=carrier,
        policy_number=(row.MemberNumber or "").strip() or None,
        group_number=(row.GroupNumber or "").strip() or None,
        plan_type=plan_type,
        effective_date=_format_display_date(row.EffectiveDate),
    )


def _fetch_employer(cursor, patient_id: int) -> PatientEmployerInfo:
    cursor.execute(
        """
        SELECT TOP 1
            emp.Name AS EmployerName,
            ch.PrivateEmployerName,
            ch.JobTitle
        FROM dbo.CheckInsHeader ch
        LEFT JOIN dbo.Employers emp
            ON emp.Id = ch.EmployerId
           AND (emp.IsDeleted = 0 OR emp.IsDeleted IS NULL)
        WHERE ch.PatientId = ?
          AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
          AND (
                ch.EmployerId IS NOT NULL
             OR NULLIF(LTRIM(RTRIM(ch.PrivateEmployerName)), '') IS NOT NULL
          )
        ORDER BY ch.CheckInDate DESC, ch.Id DESC
        """,
        (int(patient_id),),
    )
    row = cursor.fetchone()
    employer_name = None
    job_title = None
    if row:
        employer_name = (
            (row.EmployerName or "").strip()
            or (row.PrivateEmployerName or "").strip()
            or None
        )
        job_title = (row.JobTitle or "").strip() or None

    department = job_title
    if not department:
        cursor.execute(
            """
            SELECT TOP 1 dg.Description
            FROM dbo.Patients p
            LEFT JOIN dbo.DataGroups dg ON dg.Id = p.OccupationId
            WHERE p.Id = ?
              AND (p.IsDeleted = 0 OR p.IsDeleted IS NULL)
            """,
            (int(patient_id),),
        )
        occ = cursor.fetchone()
        if occ:
            department = (occ.Description or "").strip() or None

    return PatientEmployerInfo(name=employer_name, department=department)


def _format_display_date(value) -> str | None:
    """Human-readable date for My Information (e.g. Mar 15, 1985)."""
    if value is None:
        return None
    if isinstance(value, datetime):
        d = value.date()
    elif isinstance(value, date):
        d = value
    else:
        iso = _format_dob_iso(value)
        if not iso:
            return None
        try:
            d = date.fromisoformat(iso)
        except ValueError:
            return iso
    return f"{d.strftime('%b')} {d.day}, {d.year}"
