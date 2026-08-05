/** Work / shift status codes from EHRWorkStatuses.CurrentWorkShiftTypeId. */

export const ShiftType = Object.freeze({
  RegularWork: 1,
  ModifiedDuty: 2,
  OffRestOffShift: 3,
  TotalTemporaryDisabled: 4,
  OffWork: 5,
});

/** Display labels with spaces (PascalCase → spaced words). */
export const SHIFT_TYPE_LABELS = Object.freeze({
  [ShiftType.RegularWork]: "Regular Work",
  [ShiftType.ModifiedDuty]: "Modified Duty",
  [ShiftType.OffRestOffShift]: "Off Rest Off Shift",
  [ShiftType.TotalTemporaryDisabled]: "Total Temporary Disabled",
  [ShiftType.OffWork]: "Off Work",
});

export function shiftTypeLabel(value) {
  if (value == null || value === "") return null;
  const id = Number(value);
  if (!Number.isFinite(id)) return null;
  return SHIFT_TYPE_LABELS[id] ?? null;
}
