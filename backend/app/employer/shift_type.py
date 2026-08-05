"""Work / shift status codes from EHRWorkStatuses.CurrentWorkShiftTypeId."""

from __future__ import annotations

from enum import IntEnum


class ShiftType(IntEnum):
    RegularWork = 1
    ModifiedDuty = 2
    OffRestOffShift = 3
    TotalTemporaryDisabled = 4
    OffWork = 5


# Display labels with spaces (PascalCase → spaced words).
SHIFT_TYPE_LABELS: dict[ShiftType, str] = {
    ShiftType.RegularWork: "Regular Work",
    ShiftType.ModifiedDuty: "Modified Duty",
    ShiftType.OffRestOffShift: "Off Rest Off Shift",
    ShiftType.TotalTemporaryDisabled: "Total Temporary Disabled",
    ShiftType.OffWork: "Off Work",
}


def shift_type_label(value: int | None) -> str | None:
    """Map a ShiftType id to its spaced display label, or None if unknown/empty."""
    if value is None:
        return None
    try:
        shift = ShiftType(int(value))
    except (TypeError, ValueError):
        return None
    return SHIFT_TYPE_LABELS.get(shift)
