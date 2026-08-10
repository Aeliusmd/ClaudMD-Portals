"""
Patient portal appointment booking (Urgent Care + Personal Injury only).

SELECT helpers mirror employer portal slot logic. Book performs INSERTs into
existing tables only (AppointmentRecurrings, Appointments, AppointmentSchedules).
No schema / table alterations.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from math import ceil

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.db.clinic import get_clinic_by_activation_key, get_clinic_connection
from app.employer.booking import (
    ALLOWED_DURATION_MINUTES,
    _block_is_available,
    _ensure_booking_date_not_past,
    _fetch_booked_intervals,
    _fetch_patient_booked_intervals,
    _fetch_resource,
    _fetch_server_now,
    _fetch_shifts,
    _format_time,
    _format_time_display,
    _minutes_to_time,
    _parse_time,
    _read_inserted_id,
    _require_int,
    _time_to_minutes,
    _work_day_monday_first,
)
from app.employer.schemas import (
    AppointmentLocationOption,
    AppointmentPrepareResponse,
    AppointmentProviderOption,
    AppointmentSlotOption,
    AppointmentSlotsResponse,
    AppointmentVisitTypeOption,
)
from app.patient.profile import fetch_profile_from_clinic
from app.patient.schemas import PatientAppointmentBookRequest

# VisitTypes.CategoryId — patient portal may book these only.
ALLOWED_VISIT_CATEGORY_IDS = {3, 4}  # Urgent Care, Personal Injury


def _clinic_and_patient(current_user: CurrentUser):
    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )
    profile = fetch_profile_from_clinic(clinic, current_user)
    if profile.patient_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient record not found for this account.",
        )
    return clinic, profile


def list_booking_locations(current_user: CurrentUser) -> list[AppointmentLocationOption]:
    clinic, _profile = _clinic_and_patient(current_user)
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
    """Urgent Care (3) and Personal Injury (4) visit types only."""
    clinic, _profile = _clinic_and_patient(current_user)
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT Id, Code, Description, CategoryId
            FROM dbo.VisitTypes
            WHERE (IsDeleted = 0 OR IsDeleted IS NULL)
              AND CategoryId IN (3, 4)
            ORDER BY
                CASE WHEN CategoryId = 3 THEN 0 ELSE 1 END,
                Description,
                Id
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


def list_providers_for_date(
    current_user: CurrentUser,
    *,
    location_id: int,
    on_date: date,
) -> list[AppointmentProviderOption]:
    clinic, _profile = _clinic_and_patient(current_user)
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
                for part in [
                    (row.FirstName or "").strip(),
                    (row.LastName or "").strip(),
                ]
                if part
            )
        resource_name = (row.ResourceName or "").strip() or f"Resource {resource_id}"
        label = provider_name or resource_name
        if (
            provider_name
            and resource_name
            and provider_name.upper() != resource_name.upper()
        ):
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
) -> AppointmentSlotsResponse:
    clinic, profile = _clinic_and_patient(current_user)
    patient_id = int(profile.patient_id)
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
        # Additive: hide times this patient already holds (any provider/location).
        patient_booked = _fetch_patient_booked_intervals(cursor, patient_id, on_date)
        server_now = _fetch_server_now(cursor)

    slot_minutes = max(1, int(round(resource.time_slot_minutes)))
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
        while cursor_start + block_minutes <= end_bound:
            start_t = _minutes_to_time(cursor_start)
            end_t = _minutes_to_time(cursor_start + block_minutes)
            if is_today and start_t < earliest:
                cursor_start += slot_minutes
                continue

            ok, _reason = _block_is_available(
                cursor_start,
                block_minutes,
                slot_minutes,
                capacity,
                booked,
            )
            if ok and patient_booked:
                ok, _reason = _block_is_available(
                    cursor_start,
                    block_minutes,
                    slot_minutes,
                    capacity,
                    patient_booked,
                )
            if ok:
                options.append(
                    AppointmentSlotOption(
                        start=_format_time(start_t) or "",
                        end=_format_time(end_t) or "",
                        label=(
                            f"{_format_time_display(start_t)} - "
                            f"{_format_time_display(end_t)}"
                        ),
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


def book_appointment(
    current_user: CurrentUser,
    payload: PatientAppointmentBookRequest,
) -> AppointmentPrepareResponse:
    """
    Book for the logged-in patient only.
    Visit type must be Urgent Care (3) or Personal Injury (4).
    EmployerId is left NULL (patient self-booking).
    """
    clinic, profile = _clinic_and_patient(current_user)
    patient_id = int(profile.patient_id)

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
    _require_allowed_visit_type(clinic, visit_type_id)

    slots = list_available_slots(
        current_user,
        location_id=location_id,
        resource_id=resource_id,
        on_date=on_date,
        duration_minutes=duration,
    )
    start_key = _format_time(start_time)
    matching = next((s for s in slots.items if s.start == start_key), None)
    if matching is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Selected start time is not available for this provider/duration. "
                "The provider or you may already be booked, neighboring slot(s) "
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

    recurring_id = None
    appointment_id = None
    schedule_id = None

    try:
        with get_clinic_connection(clinic, autocommit=False) as conn:
            cursor = conn.cursor()
            try:
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
                    VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, SYSDATETIMEOFFSET(), 0, 0)
                    """,
                    (
                        location_id,
                        patient_id,
                        visit_type_id,
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
        employer_id=None,
        location_id=location_id,
        resource_id=resource_id,
        date=on_date.isoformat(),
        start_time=_format_time(start_time),
        end_time=_format_time(end_time),
        duration_minutes=booked_duration,
        slots_needed=slots_needed,
        time_slot_minutes=slot_minutes,
        warnings=[],
        patient_id=patient_id,
        recurring_id=recurring_id,
        appointment_id=appointment_id,
        schedule_id=schedule_id,
    )


def _require_allowed_visit_type(clinic, visit_type_id: int) -> None:
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT CategoryId
            FROM dbo.VisitTypes
            WHERE Id = ?
              AND (IsDeleted = 0 OR IsDeleted IS NULL)
            """,
            (visit_type_id,),
        )
        row = cursor.fetchone()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Visit type not found.",
        )
    try:
        category_id = int(row.CategoryId) if row.CategoryId is not None else None
    except (TypeError, ValueError):
        category_id = None
    if category_id not in ALLOWED_VISIT_CATEGORY_IDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Patient portal bookings are limited to Urgent Care and "
                "Personal Injury visit types."
            ),
        )
