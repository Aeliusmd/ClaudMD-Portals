"""
Employer appointment booking helpers.

Database access for live endpoints is SELECT-only.
Prepare/submit builds INSERT scripts and never executes them against the clinic DB.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from math import ceil

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.db.clinic import get_clinic_by_activation_key, get_clinic_connection
from app.employer.profile import fetch_profile_from_clinic
from app.employer.schemas import (
    AppointmentLocationOption,
    AppointmentPatientOption,
    AppointmentPrepareRequest,
    AppointmentPrepareResponse,
    AppointmentProviderOption,
    AppointmentSlotOption,
    AppointmentSlotsResponse,
    AppointmentVisitTypeOption,
    NewPatientPayload,
)

# Status ids observed / aligned with portal labels.
# 3 = Cancelled — does not block availability.
CANCELLED_STATUS_IDS = {3}

# Employer portal booking durations (minutes).
ALLOWED_DURATION_MINUTES = {15, 30, 45, 60}


def _clinic_and_employer(current_user: CurrentUser):
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
    return clinic, profile


def list_booking_locations(current_user: CurrentUser) -> list[AppointmentLocationOption]:
    clinic, _profile = _clinic_and_employer(current_user)
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT Id, Name, ShortName
            FROM dbo.Locations
            WHERE (IsDeleted = 0 OR IsDeleted IS NULL)
              AND RecordStatusId = 1
            ORDER BY Name, Id
            """
        )
        rows = cursor.fetchall()
    return [
        AppointmentLocationOption(
            id=int(row.Id),
            name=(row.Name or "").strip() or f"Location {row.Id}",
            short_name=(row.ShortName or "").strip() or None,
        )
        for row in rows
    ]


def list_booking_visit_types(
    current_user: CurrentUser,
) -> list[AppointmentVisitTypeOption]:
    clinic, _profile = _clinic_and_employer(current_user)
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT Id, Code, Description, CategoryId
            FROM dbo.VisitTypes
            WHERE (IsDeleted = 0 OR IsDeleted IS NULL)
            ORDER BY Description, Id
            """
        )
        rows = cursor.fetchall()
    return [
        AppointmentVisitTypeOption(
            id=int(row.Id),
            code=(row.Code or "").strip() or None,
            name=(row.Description or row.Code or f"Visit {row.Id}").strip(),
            category_id=int(row.CategoryId) if row.CategoryId is not None else None,
        )
        for row in rows
    ]


def list_booking_patients(
    current_user: CurrentUser,
    *,
    search: str | None = None,
) -> list[AppointmentPatientOption]:
    clinic, profile = _clinic_and_employer(current_user)
    employer_id = profile.employer_id
    term = (search or "").strip()

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        params: list = [employer_id, employer_id]
        search_sql = ""
        if term:
            like = f"%{term}%"
            search_sql = """
              AND (
                    p.FirstName LIKE ?
                 OR p.LastName LIKE ?
                 OR CONCAT(p.FirstName, ' ', p.LastName) LIKE ?
                 OR CAST(p.AccountNumber AS nvarchar(30)) LIKE ?
                 OR p.SSN LIKE ?
              )
            """
            params.extend([like, like, like, like, like])

        cursor.execute(
            f"""
            SELECT DISTINCT
                p.Id,
                p.AccountNumber,
                p.FirstName,
                p.LastName,
                p.DateOfBirth,
                p.GenderId,
                p.SSN,
                p.CellPhone,
                p.LocationId
            FROM dbo.Patients p
            WHERE (p.IsDeleted = 0 OR p.IsDeleted IS NULL)
              AND (
                    p.Id IN (
                        SELECT DISTINCT ch.PatientId
                        FROM dbo.CheckInsHeader ch
                        WHERE ch.EmployerId = ?
                          AND ch.PatientId IS NOT NULL
                          AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
                    )
                 OR p.Id IN (
                        SELECT DISTINCT a.PatientId
                        FROM dbo.Appointments a
                        WHERE a.EmployerId = ?
                          AND a.PatientId IS NOT NULL
                          AND (a.IsDeleted = 0 OR a.IsDeleted IS NULL)
                    )
              )
              {search_sql}
            ORDER BY p.LastName, p.FirstName, p.Id
            """,
            params,
        )
        rows = cursor.fetchall()

    results: list[AppointmentPatientOption] = []
    for row in rows:
        first = (row.FirstName or "").strip()
        last = (row.LastName or "").strip()
        name = " ".join(part for part in [first, last] if part) or f"Patient {row.Id}"
        dob = row.DateOfBirth
        dob_iso = None
        if isinstance(dob, datetime):
            dob_iso = dob.date().isoformat()
        elif isinstance(dob, date):
            dob_iso = dob.isoformat()
        results.append(
            AppointmentPatientOption(
                id=int(row.Id),
                name=name,
                first_name=first or None,
                last_name=last or None,
                account_no=str(row.AccountNumber) if row.AccountNumber is not None else None,
                ssn=(row.SSN or "").strip() or None,
                date_of_birth=dob_iso,
                gender_id=int(row.GenderId) if row.GenderId is not None else None,
                gender=_gender_label(row.GenderId),
                phone=(row.CellPhone or "").strip() or None,
                location_id=int(row.LocationId) if row.LocationId is not None else None,
            )
        )
    return results


def list_providers_for_date(
    current_user: CurrentUser,
    *,
    location_id: int,
    on_date: date,
) -> list[AppointmentProviderOption]:
    clinic, _profile = _clinic_and_employer(current_user)
    _ensure_booking_date_not_past(clinic, on_date)
    work_day = _work_day_monday_first(on_date)

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                ar.Id AS ResourceId,
                ar.Name AS ResourceName,
                ar.TimeSlot,
                ar.NumberOfPatientsPerSlot,
                ar.ProviderId,
                ar.LocationId,
                p.Name AS ProviderName,
                p.FirstName,
                p.LastName,
                sh.StartTime AS ShiftStart,
                sh.EndTime AS ShiftEnd
            FROM dbo.AppointmentResources ar
            INNER JOIN dbo.AppointmentResourceShifts sh
                ON sh.ResourceId = ar.Id
               AND sh.WorkDay = ?
               AND (sh.IsDeleted = 0 OR sh.IsDeleted IS NULL)
            LEFT JOIN dbo.Providers p ON p.Id = ar.ProviderId
            WHERE ar.LocationId = ?
              AND (ar.IsDeleted = 0 OR ar.IsDeleted IS NULL)
              AND ar.RecordStatusId = 1
              AND ar.ProviderId IS NOT NULL
            ORDER BY COALESCE(p.Name, ar.Name), ar.Id, sh.StartTime
            """,
            (work_day, location_id),
        )
        rows = cursor.fetchall()

    by_resource: dict[int, AppointmentProviderOption] = {}
    for row in rows:
        resource_id = int(row.ResourceId)
        existing = by_resource.get(resource_id)
        shift_start = _format_time(row.ShiftStart)
        shift_end = _format_time(row.ShiftEnd)
        if existing:
            if shift_start and shift_end:
                existing.shifts.append({"start": shift_start, "end": shift_end})
            continue

        provider_name = (row.ProviderName or "").strip()
        if not provider_name:
            provider_name = " ".join(
                part
                for part in [(row.FirstName or "").strip(), (row.LastName or "").strip()]
                if part
            )
        resource_name = (row.ResourceName or "").strip() or f"Resource {resource_id}"
        label = provider_name or resource_name
        if provider_name and resource_name and provider_name.upper() != resource_name.upper():
            label = f"{provider_name} ({resource_name})"

        by_resource[resource_id] = AppointmentProviderOption(
            resource_id=resource_id,
            provider_id=int(row.ProviderId) if row.ProviderId is not None else None,
            name=label,
            resource_name=resource_name,
            provider_name=provider_name or None,
            location_id=int(row.LocationId),
            time_slot_minutes=float(row.TimeSlot or 15),
            patients_per_slot=int(row.NumberOfPatientsPerSlot or 1),
            shifts=[{"start": shift_start, "end": shift_end}]
            if shift_start and shift_end
            else [],
        )

    return list(by_resource.values())


def list_available_slots(
    current_user: CurrentUser,
    *,
    location_id: int,
    resource_id: int,
    on_date: date,
    duration_minutes: int,
    patient_id: int | None = None,
) -> AppointmentSlotsResponse:
    clinic, _profile = _clinic_and_employer(current_user)
    _ensure_booking_date_not_past(clinic, on_date)
    if duration_minutes not in ALLOWED_DURATION_MINUTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Duration must be 15, 30, 45, or 60 minutes.",
        )

    work_day = _work_day_monday_first(on_date)
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        resource = _fetch_resource(cursor, resource_id, location_id)
        shifts = _fetch_shifts(cursor, resource_id, work_day)
        booked = _fetch_booked_intervals(cursor, resource_id, on_date)
        # Additive: when a patient is selected, also hide times they already hold.
        patient_booked = (
            _fetch_patient_booked_intervals(cursor, int(patient_id), on_date)
            if patient_id is not None
            else []
        )
        server_now = _fetch_server_now(cursor)

    slot_minutes = max(1, int(round(resource.time_slot_minutes)))
    # Portal booking: any existing non-cancelled booking occupies the slot.
    # Do not allow a second booking for the same doctor/date/time even when
    # AppointmentResources.NumberOfPatientsPerSlot > 1 in the clinic DB.
    capacity = 1
    db_patients_per_slot = max(1, resource.patients_per_slot)
    slots_needed = max(1, ceil(duration_minutes / slot_minutes))
    block_minutes = slots_needed * slot_minutes

    now_local = server_now
    is_today = on_date == now_local.date()
    earliest = now_local.time() if is_today else time(0, 0)

    options: list[AppointmentSlotOption] = []
    for shift_start, shift_end in shifts:
        cursor_start = _time_to_minutes(shift_start)
        end_bound = _time_to_minutes(shift_end)
        # Align to slot grid from shift start
        while cursor_start + block_minutes <= end_bound:
            start_t = _minutes_to_time(cursor_start)
            end_t = _minutes_to_time(cursor_start + block_minutes)
            if is_today and start_t < earliest:
                cursor_start += slot_minutes
                continue

            ok, reason = _block_is_available(
                cursor_start,
                block_minutes,
                slot_minutes,
                capacity,
                booked,
            )
            if ok and patient_booked:
                ok, reason = _block_is_available(
                    cursor_start,
                    block_minutes,
                    slot_minutes,
                    capacity,
                    patient_booked,
                )
            if ok:
                options.append(
                    AppointmentSlotOption(
                        start= _format_time(start_t) or "",
                        end=_format_time(end_t) or "",
                        label=f"{_format_time_display(start_t)} - {_format_time_display(end_t)}",
                        slots_used=slots_needed,
                    )
                )
            cursor_start += slot_minutes

    return AppointmentSlotsResponse(
        date=on_date.isoformat(),
        location_id=location_id,
        resource_id=resource_id,
        duration_minutes=duration_minutes,
        time_slot_minutes=slot_minutes,
        patients_per_slot=db_patients_per_slot,
        slots_needed=slots_needed,
        items=options,
    )


def prepare_appointment_insert(
    current_user: CurrentUser,
    payload: AppointmentPrepareRequest,
) -> AppointmentPrepareResponse:
    """Backward-compatible alias — books the appointment (INSERTs only, no schema changes). """
    return book_appointment(current_user, payload)


def book_appointment(
    current_user: CurrentUser,
    payload: AppointmentPrepareRequest,
) -> AppointmentPrepareResponse:
    """
    Validate availability with SELECTs, then INSERT into existing tables only:
    Patients (optional), AppointmentRecurrings, Appointments, AppointmentSchedules.
    No ALTER / new tables / column changes.
    """
    clinic, profile = _clinic_and_employer(current_user)
    employer_id = profile.employer_id
    assert employer_id is not None

    on_date = date.fromisoformat(payload.date)
    _ensure_booking_date_not_past(clinic, on_date)
    duration = int(payload.duration_minutes)
    if duration not in ALLOWED_DURATION_MINUTES:
        raise HTTPException(
            status_code=400,
            detail="Duration must be 15, 30, 45, or 60 minutes.",
        )

    start_time = _parse_time(payload.start_time)
    if start_time is None:
        raise HTTPException(status_code=400, detail="Invalid start time.")

    location_id = _require_int(payload.location_id, "location")
    resource_id = _require_int(payload.resource_id, "provider/resource")
    visit_type_id = _require_int(payload.visit_type_id, "visit type")

    patient_id = (
        _require_int(payload.patient_id, "patient")
        if payload.patient_id is not None
        else None
    )
    new_patient = payload.new_patient if patient_id is None else None

    if new_patient is None and patient_id is None:
        raise HTTPException(status_code=400, detail="Select an existing patient or add a new one.")

    if new_patient is not None:
        _validate_new_patient_payload(new_patient)

    # Re-validate slot availability with current DB reads (provider + selected patient).
    slots = list_available_slots(
        current_user,
        location_id=location_id,
        resource_id=resource_id,
        on_date=on_date,
        duration_minutes=duration,
        patient_id=patient_id,
    )
    start_key = _format_time(start_time)
    matching = next((s for s in slots.items if s.start == start_key), None)
    if matching is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Selected start time is not available for this provider/duration. "
                "The provider or patient may already be booked, neighboring slot(s) "
                "may be taken, or the time is in the past."
            ),
        )

    created_user_id = int(current_user.user_id or 0)
    slot_minutes = slots.time_slot_minutes
    slots_needed = slots.slots_needed
    booked_duration = slots_needed * slot_minutes
    end_time = (
        datetime.combine(on_date, start_time) + timedelta(minutes=booked_duration)
    ).time()
    status_id = int(payload.appointment_status_id or 4)
    schedule_type_id = int(payload.schedule_type_id or 1)
    note_value = (payload.note or "").strip() or None
    warnings: list[str] = []

    recurring_id = None
    appointment_id = None
    schedule_id = None
    created_patient_ssn: str | None = None

    try:
        with get_clinic_connection(clinic, autocommit=False) as conn:
            cursor = conn.cursor()
            try:
                if new_patient is not None:
                    gender_id = int(
                        new_patient.gender_id
                        or _gender_id_from_code(new_patient.gender)
                        or 0
                    )
                    if gender_id <= 0:
                        raise HTTPException(
                            status_code=400,
                            detail="Gender is required for new patients.",
                        )
                    if (new_patient.account_no or "").strip().isdigit():
                        account_no = int(new_patient.account_no.strip())
                    else:
                        cursor.execute(
                            "SELECT ISNULL(MAX(AccountNumber), 100000) + 1 FROM dbo.Patients"
                        )
                        account_row = cursor.fetchone()
                        account_no = _require_int(
                            account_row[0] if account_row else None,
                            "next account number",
                        )

                    ssn_value = (new_patient.ssn or "").strip()
                    if not ssn_value:
                        ssn_value = _allocate_next_auto_ssn(cursor, created_user_id)
                    created_patient_ssn = ssn_value

                    cursor.execute(
                        """
                        INSERT INTO dbo.Patients (
                            LocationId, AccountNumber, SSN, LastName, FirstName,
                            DateOfBirth, GenderId, CellPhone,
                            Address1, Address2, City, State, ZipCode,
                            CreatedUserId, CreatedDateTime, RecordStatusId, IsDeleted
                        )
                        OUTPUT INSERTED.Id
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, SYSDATETIMEOFFSET(), 1, 0)
                        """,
                        (
                            location_id,
                            account_no,
                            ssn_value,
                            new_patient.last_name.strip(),
                            new_patient.first_name.strip(),
                            new_patient.date_of_birth,
                            gender_id,
                            (new_patient.phone or "").strip(),
                            (new_patient.address1 or "").strip(),
                            (new_patient.address2 or "").strip() or None,
                            (new_patient.city or "").strip(),
                            (new_patient.state or "").strip(),
                            (new_patient.zip_code or "").strip(),
                            created_user_id,
                        ),
                    )
                    patient_id = _read_inserted_id(cursor, "patient")

                cursor.execute(
                    """
                    INSERT INTO dbo.AppointmentRecurrings (
                        RecurringTypeId, StartDate, EndDate, WeeklyBiWeeklyWeekDays,
                        CreatedUserId, CreatedDateTime, RecordStatusId, IsDeleted
                    )
                    OUTPUT INSERTED.Id
                    VALUES (1, ?, ?, NULL, ?, SYSDATETIMEOFFSET(), 0, 0)
                    """,
                    (on_date, on_date, created_user_id),
                )
                recurring_id = _read_inserted_id(cursor, "recurring")

                cursor.execute(
                    """
                    INSERT INTO dbo.Appointments (
                        LocationId, PatientId, VisitTypeId, EmployerId, IncidentId,
                        ResourceId, RecurringId, Note,
                        CreatedUserId, CreatedDateTime, RecordStatusId, IsDeleted
                    )
                    OUTPUT INSERTED.Id
                    VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, SYSDATETIMEOFFSET(), 0, 0)
                    """,
                    (
                        location_id,
                        patient_id,
                        visit_type_id,
                        int(employer_id),
                        resource_id,
                        recurring_id,
                        note_value,
                        created_user_id,
                    ),
                )
                appointment_id = _read_inserted_id(cursor, "appointment")

                cursor.execute(
                    """
                    INSERT INTO dbo.AppointmentSchedules (
                        LocationId, Date, StartTime, EndTime, ResourceId,
                        CheckInId, AppointmentId, BlockId, AppointmentStatusId,
                        ScheduleTypeId, Duration, RecurringId, ReasonId, Note,
                        CreatedUserId, CreatedDateTime, RecordStatusId, IsDeleted
                    )
                    OUTPUT INSERTED.Id
                    VALUES (
                        ?, ?, ?, ?, ?,
                        NULL, ?, NULL, ?,
                        ?, ?, ?, NULL, ?,
                        ?, SYSDATETIMEOFFSET(), 0, 0
                    )
                    """,
                    (
                        location_id,
                        on_date,
                        start_time,
                        end_time,
                        resource_id,
                        appointment_id,
                        status_id,
                        schedule_type_id,
                        booked_duration,
                        recurring_id,
                        note_value,
                        created_user_id,
                    ),
                )
                schedule_id = _read_inserted_id(cursor, "schedule")

                conn.commit()
            except Exception:
                conn.rollback()
                raise
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unable to save appointment: {exc}",
        ) from exc

    return AppointmentPrepareResponse(
        executed=True,
        message="Appointment booked successfully.",
        sql_script=None,
        draft_file=None,
        employer_id=employer_id,
        location_id=payload.location_id,
        resource_id=payload.resource_id,
        date=on_date.isoformat(),
        start_time=_format_time(start_time),
        end_time=_format_time(end_time),
        duration_minutes=booked_duration,
        slots_needed=slots_needed,
        time_slot_minutes=slot_minutes,
        warnings=warnings,
        patient_id=patient_id,
        patient_ssn=created_patient_ssn,
        recurring_id=recurring_id,
        appointment_id=appointment_id,
        schedule_id=schedule_id,
    )


# --- internals -----------------------------------------------------------------


@dataclass
class _ResourceInfo:
    resource_id: int
    location_id: int
    time_slot_minutes: float
    patients_per_slot: int
    provider_id: int | None
    name: str


@dataclass
class _BookedInterval:
    start_minutes: int
    end_minutes: int


def _fetch_resource(cursor, resource_id: int, location_id: int) -> _ResourceInfo:
    cursor.execute(
        """
        SELECT Id, LocationId, TimeSlot, NumberOfPatientsPerSlot, ProviderId, Name
        FROM dbo.AppointmentResources
        WHERE Id = ?
          AND LocationId = ?
          AND (IsDeleted = 0 OR IsDeleted IS NULL)
          AND RecordStatusId = 1
        """,
        (resource_id, location_id),
    )
    row = cursor.fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Provider/resource not found for this location.",
        )
    return _ResourceInfo(
        resource_id=int(row.Id),
        location_id=int(row.LocationId),
        time_slot_minutes=float(row.TimeSlot or 15),
        patients_per_slot=int(row.NumberOfPatientsPerSlot or 1),
        provider_id=int(row.ProviderId) if row.ProviderId is not None else None,
        name=(row.Name or "").strip() or f"Resource {row.Id}",
    )


def _fetch_shifts(cursor, resource_id: int, work_day: int) -> list[tuple[time, time]]:
    cursor.execute(
        """
        SELECT StartTime, EndTime
        FROM dbo.AppointmentResourceShifts
        WHERE ResourceId = ?
          AND WorkDay = ?
          AND (IsDeleted = 0 OR IsDeleted IS NULL)
        ORDER BY StartTime
        """,
        (resource_id, work_day),
    )
    shifts = []
    for row in cursor.fetchall():
        if row.StartTime is None or row.EndTime is None:
            continue
        start = row.StartTime if isinstance(row.StartTime, time) else _parse_time(str(row.StartTime))
        end = row.EndTime if isinstance(row.EndTime, time) else _parse_time(str(row.EndTime))
        if start and end and start < end:
            shifts.append((start, end))
    if not shifts:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Provider has no working hours on the selected date.",
        )
    return shifts


def _fetch_booked_intervals(cursor, resource_id: int, on_date: date) -> list[_BookedInterval]:
    cursor.execute(
        """
        SELECT StartTime, EndTime, AppointmentStatusId
        FROM dbo.AppointmentSchedules
        WHERE ResourceId = ?
          AND Date = ?
          AND (IsDeleted = 0 OR IsDeleted IS NULL)
        """,
        (resource_id, on_date),
    )
    booked: list[_BookedInterval] = []
    for row in cursor.fetchall():
        status_id = int(row.AppointmentStatusId) if row.AppointmentStatusId is not None else None
        if status_id in CANCELLED_STATUS_IDS:
            continue
        start = row.StartTime if isinstance(row.StartTime, time) else _parse_time(str(row.StartTime))
        end = row.EndTime if isinstance(row.EndTime, time) else _parse_time(str(row.EndTime))
        if not start or not end or end <= start:
            continue
        booked.append(
            _BookedInterval(
                start_minutes=_time_to_minutes(start),
                end_minutes=_time_to_minutes(end),
            )
        )
    return booked


def _fetch_patient_booked_intervals(
    cursor,
    patient_id: int,
    on_date: date,
) -> list[_BookedInterval]:
    """
    Existing non-cancelled schedules for a patient on a date (any provider/location).
    Used only as an additive filter after provider availability is computed.
    """
    cursor.execute(
        """
        SELECT s.StartTime, s.EndTime, s.AppointmentStatusId
        FROM dbo.AppointmentSchedules s
        LEFT JOIN dbo.Appointments a ON a.Id = s.AppointmentId
        LEFT JOIN dbo.CheckInsHeader ch ON ch.Id = s.CheckInId
        WHERE s.Date = ?
          AND (s.IsDeleted = 0 OR s.IsDeleted IS NULL)
          AND COALESCE(a.PatientId, ch.PatientId) = ?
        """,
        (on_date, int(patient_id)),
    )
    booked: list[_BookedInterval] = []
    for row in cursor.fetchall():
        status_id = int(row.AppointmentStatusId) if row.AppointmentStatusId is not None else None
        if status_id in CANCELLED_STATUS_IDS:
            continue
        start = row.StartTime if isinstance(row.StartTime, time) else _parse_time(str(row.StartTime))
        end = row.EndTime if isinstance(row.EndTime, time) else _parse_time(str(row.EndTime))
        if not start or not end or end <= start:
            continue
        booked.append(
            _BookedInterval(
                start_minutes=_time_to_minutes(start),
                end_minutes=_time_to_minutes(end),
            )
        )
    return booked


def _fetch_server_now(cursor) -> datetime:
    cursor.execute("SELECT CAST(SYSDATETIMEOFFSET() AS datetime2)")
    value = cursor.fetchone()[0]
    if isinstance(value, datetime):
        return value
    return datetime.now()


def _block_is_available(
    start_minutes: int,
    block_minutes: int,
    slot_minutes: int,
    capacity: int,
    booked: list[_BookedInterval],
) -> tuple[bool, str | None]:
    end_minutes = start_minutes + block_minutes
    cursor = start_minutes
    while cursor < end_minutes:
        slot_end = cursor + slot_minutes
        overlapping = sum(
            1
            for item in booked
            if item.start_minutes < slot_end and item.end_minutes > cursor
        )
        if overlapping >= capacity:
            return False, "overlapping_booking"
        cursor = slot_end
    return True, None


def _require_int(value, label: str) -> int:
    if value is None or value == "":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing required {label}.",
        )
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {label}.",
        ) from exc


def _read_inserted_id(cursor, label: str) -> int:
    row = cursor.fetchone()
    if not row or row[0] is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database did not return a new {label} id after insert.",
        )
    try:
        return int(row[0])
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Invalid {label} id returned from database.",
        ) from exc


def _ensure_booking_date_not_past(clinic, on_date: date) -> None:
    """Reject appointment dates before the clinic server's current date."""
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT CAST(GETDATE() AS date)")
        today = cursor.fetchone()[0]
    if isinstance(today, datetime):
        today = today.date()
    if on_date < today:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Appointment date must be today or a future date.",
        )


def _work_day_monday_first(value: date) -> int:
    # Monday=1 ... Sunday=7 (matches AppointmentResourceShifts samples)
    return value.isoweekday()


def _time_to_minutes(value: time) -> int:
    return value.hour * 60 + value.minute


def _minutes_to_time(value: int) -> time:
    value = max(0, min(value, 24 * 60 - 1))
    return time(hour=value // 60, minute=value % 60)


def _parse_time(value: str | None) -> time | None:
    if not value:
        return None
    text = value.strip()
    for fmt in ("%H:%M:%S", "%H:%M", "%I:%M %p", "%I:%M%p"):
        try:
            return datetime.strptime(text, fmt).time().replace(second=0, microsecond=0)
        except ValueError:
            continue
    return None


def _format_time(value: time | None) -> str | None:
    if value is None:
        return None
    return value.strftime("%H:%M:%S")


def _format_time_display(value: time | None) -> str:
    if value is None:
        return "—"
    return value.strftime("%I:%M %p").lstrip("0")


def _gender_label(gender_id: int | None) -> str | None:
    if gender_id == 1:
        return "M"
    if gender_id == 2:
        return "F"
    if gender_id is None:
        return None
    return "O"


def _allocate_next_auto_ssn(cursor, created_user_id: int) -> str:
    """
    Allocate the next clinic auto-SSN using existing dbo.AutoGeneratedSSNs.
    Pattern matches ClaudMD desktop: ABC-D5-#### (prefix taken from latest row).

    dbo.AutoGeneratedSSNs.Id is NOT an identity column — callers must supply Id.
    We set Id = MAX(Id)+1. INSERT only into the existing table — no schema changes.
    """
    user_id = int(created_user_id or 0)

    for _ in range(25):
        cursor.execute(
            """
            SELECT TOP 1 Id, SSN
            FROM dbo.AutoGeneratedSSNs
            WHERE NULLIF(LTRIM(RTRIM(SSN)), '') IS NOT NULL
            ORDER BY Id DESC
            """
        )
        latest = cursor.fetchone()
        prefix = "ABC-D5"
        next_num = 1
        width = 4
        next_id = 1
        if latest:
            next_id = int(latest[0]) + 1
            current = str(latest[1] or "").strip()
            head, sep, tail = current.rpartition("-")
            if sep and tail.isdigit():
                prefix = head
                width = max(len(tail), 4)
                next_num = int(tail) + 1

        # Prefer MAX(Id)+1 in case SSN order and Id order diverge.
        cursor.execute("SELECT ISNULL(MAX(Id), 0) + 1 FROM dbo.AutoGeneratedSSNs")
        max_id_row = cursor.fetchone()
        if max_id_row and max_id_row[0] is not None:
            next_id = max(next_id, int(max_id_row[0]))

        candidate = f"{prefix}-{next_num:0{width}d}"

        # Patients.SSN is unique — advance past values already assigned.
        cursor.execute(
            """
            SELECT TOP 1 Id
            FROM dbo.Patients
            WHERE SSN = ?
            """,
            (candidate,),
        )
        if cursor.fetchone() is not None:
            cursor.execute(
                """
                INSERT INTO dbo.AutoGeneratedSSNs (
                    Id, SSN, CreatedUserId, CreatedDateTime, RecordStatusId, IsDeleted
                )
                VALUES (?, ?, ?, SYSDATETIMEOFFSET(), 1, 0)
                """,
                (next_id, candidate, user_id),
            )
            continue

        try:
            cursor.execute(
                """
                INSERT INTO dbo.AutoGeneratedSSNs (
                    Id, SSN, CreatedUserId, CreatedDateTime, RecordStatusId, IsDeleted
                )
                OUTPUT INSERTED.SSN
                VALUES (?, ?, ?, SYSDATETIMEOFFSET(), 1, 0)
                """,
                (next_id, candidate, user_id),
            )
        except Exception:
            # Concurrent Id/SSN collision — retry with a fresh MAX(Id)/SSN.
            continue

        inserted = cursor.fetchone()
        if inserted and inserted[0]:
            return str(inserted[0]).strip()
        return candidate

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Unable to generate the next SSN.",
    )


def _validate_new_patient_payload(new_patient: NewPatientPayload) -> None:
    first_name = (new_patient.first_name or "").strip()
    last_name = (new_patient.last_name or "").strip()
    if not first_name:
        raise HTTPException(status_code=400, detail="First name is required.")
    if any(ch.isdigit() for ch in first_name):
        raise HTTPException(
            status_code=400,
            detail="First name cannot contain numbers.",
        )
    if not last_name:
        raise HTTPException(status_code=400, detail="Last name is required.")
    if any(ch.isdigit() for ch in last_name):
        raise HTTPException(
            status_code=400,
            detail="Last name cannot contain numbers.",
        )
    if not new_patient.date_of_birth:
        raise HTTPException(status_code=400, detail="Date of birth is required.")
    try:
        dob = date.fromisoformat(str(new_patient.date_of_birth)[:10])
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail="New patient date of birth is invalid.",
        ) from exc
    if dob > date.today():
        raise HTTPException(
            status_code=400,
            detail="Date of birth cannot be in the future.",
        )
    # SSN is optional — blank values are auto-generated from dbo.AutoGeneratedSSNs.
    phone_digits = "".join(ch for ch in (new_patient.phone or "") if ch.isdigit())
    if not phone_digits:
        raise HTTPException(status_code=400, detail="Cell phone is required.")
    if len(phone_digits) != 10 or phone_digits != (new_patient.phone or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Cell phone must be a 10-digit number.",
        )
    if len(set(phone_digits)) == 1:
        raise HTTPException(
            status_code=400,
            detail="Cell phone cannot use the same digit repeatedly.",
        )
    gender_id = new_patient.gender_id or _gender_id_from_code(new_patient.gender)
    if gender_id is None:
        raise HTTPException(status_code=400, detail="Gender is required.")
    if not (new_patient.address1 or "").strip():
        raise HTTPException(status_code=400, detail="Address 1 is required.")
    city = (new_patient.city or "").strip()
    if not city:
        raise HTTPException(status_code=400, detail="City is required.")
    if any(ch.isdigit() for ch in city):
        raise HTTPException(
            status_code=400,
            detail="City cannot contain numbers.",
        )
    if not (new_patient.state or "").strip():
        raise HTTPException(status_code=400, detail="State is required.")
    zip_code = (new_patient.zip_code or "").strip()
    if not zip_code:
        raise HTTPException(status_code=400, detail="Zip is required.")
    if not re.fullmatch(r"\d{5}(-\d{4})?", zip_code):
        raise HTTPException(
            status_code=400,
            detail="Zip must be 5 digits or ZIP+4 (12345-6789).",
        )


def _gender_id_from_code(code: str | None) -> int | None:
    if not code:
        return None
    normalized = code.strip().upper()
    if normalized in {"M", "MALE", "1"}:
        return 1
    if normalized in {"F", "FEMALE", "2"}:
        return 2
    return 3
