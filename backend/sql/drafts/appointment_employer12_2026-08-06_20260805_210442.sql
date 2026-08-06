/* ClaudMD Portals — DRAFT appointment INSERT script
   Generated for manual review/execution only.
   This API does NOT execute these statements.
   EmployerId=12 LocationId=1 ResourceId=45 Date=2026-08-06 Start=09:00:00 DurationMinutes=30
*/
SET XACT_ABORT ON;
BEGIN TRANSACTION;

-- 2) Once-only recurring header (matches mother-app Once bookings)
DECLARE @RecurringId INT;
INSERT INTO dbo.AppointmentRecurrings (
    RecurringTypeId, StartDate, EndDate, WeeklyBiWeeklyWeekDays,
    CreatedUserId, CreatedDateTime, RecordStatusId, IsDeleted
)
VALUES (
    1,
    '2026-08-06',
    '2026-08-06',
    NULL,
    10076,
    SYSDATETIMEOFFSET(),
    0,
    0
);
SET @RecurringId = SCOPE_IDENTITY();

-- 3) Appointment header
DECLARE @AppointmentId INT;
INSERT INTO dbo.Appointments (
    LocationId, PatientId, VisitTypeId, EmployerId, IncidentId,
    ResourceId, RecurringId, Note,
    CreatedUserId, CreatedDateTime, RecordStatusId, IsDeleted
)
VALUES (
    1,
    97,
    360,
    12,
    NULL,
    45,
    @RecurringId,
    N'portal draft test',
    10076,
    SYSDATETIMEOFFSET(),
    0,
    0
);
SET @AppointmentId = SCOPE_IDENTITY();

-- 4) Schedule row (Duration spans 2 x 15-minute provider slot(s))
INSERT INTO dbo.AppointmentSchedules (
    LocationId, Date, StartTime, EndTime, ResourceId,
    CheckInId, AppointmentId, BlockId, AppointmentStatusId,
    ScheduleTypeId, Duration, RecurringId, ReasonId, Note,
    CreatedUserId, CreatedDateTime, RecordStatusId, IsDeleted
)
VALUES (
    1,
    '2026-08-06',
    '09:00:00',
    '09:30:00',
    45,
    NULL,
    @AppointmentId,
    NULL,
    4,
    1,
    30,
    @RecurringId,
    NULL,
    N'portal draft test',
    10076,
    SYSDATETIMEOFFSET(),
    0,
    0
);

COMMIT TRANSACTION;
