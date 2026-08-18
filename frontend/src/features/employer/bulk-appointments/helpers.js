/** Shared field helpers for the bulk-appointment draft UI (no booking API). */

export const APPOINTMENT_STATUSES = [
  { value: "1", label: "Pending" },
  { value: "2", label: "Confirmed" },
];

export const DURATION_OPTIONS = [
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "45", label: "45 minutes" },
  { value: "60", label: "60 minutes" },
];

export const GENDER_OPTIONS = [
  { value: "M", label: "Male" },
  { value: "F", label: "Female" },
  { value: "O", label: "Other" },
];

export const US_STATE_OPTIONS = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC", "PR",
].map((code) => ({ value: code, label: code }));

export const CELL_PHONE_DIGITS = 10;
const ZIP_PATTERN = /^\d{5}(-\d{4})?$/;

export const controlClass =
  "w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60";

export function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

export function isAllSameDigit(value) {
  const digits = digitsOnly(value);
  return digits.length > 0 && /^(\d)\1+$/.test(digits);
}

export function sanitizePersonName(value) {
  return String(value || "").replace(/\d/g, "");
}

export function personNameError(value, label) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return `Enter ${label}.`;
  if (/\d/.test(trimmed)) {
    return `${label.charAt(0).toUpperCase()}${label.slice(1)} cannot contain numbers.`;
  }
  return null;
}

export function sanitizePatientGivenName(value) {
  return String(value || "").replace(/[^\p{L}\s]/gu, "");
}

export function patientGivenNameError(value, label) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return `Enter ${label}.`;
  if (/\d/.test(trimmed)) {
    return `${label.charAt(0).toUpperCase()}${label.slice(1)} cannot contain numbers.`;
  }
  if (/[^\p{L}\s]/u.test(trimmed)) {
    return `${label.charAt(0).toUpperCase()}${label.slice(1)} cannot contain special characters.`;
  }
  return null;
}

export function sanitizeZipCode(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function zipCodeError(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "Enter zip.";
  if (!ZIP_PATTERN.test(trimmed)) {
    return "Enter a 5-digit ZIP or ZIP+4 (12345-6789).";
  }
  return null;
}

export function todayIsoLocal() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function toDisplayTime(hhmmss) {
  if (!hhmmss) return "—";
  const [h, m] = hhmmss.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export function formatDisplayDate(isoDate) {
  if (!isoDate) return "—";
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function emptyNewPatient() {
  return {
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    ssn: "",
    gender: "",
    accountNo: "",
    phone: "",
    address1: "",
    address2: "",
    city: "",
    state: "",
    zipCode: "",
  };
}

export function newPatientDisplayName(patient) {
  return `${patient?.firstName || ""} ${patient?.lastName || ""}`.trim() || "New employee";
}

export function validateNewPatient(newPatient) {
  const next = {};
  const firstNameErr = patientGivenNameError(newPatient.firstName, "first name");
  if (firstNameErr) next.firstName = firstNameErr;
  const lastNameErr = patientGivenNameError(newPatient.lastName, "last name");
  if (lastNameErr) next.lastName = lastNameErr;
  if (!newPatient.dateOfBirth) {
    next.dateOfBirth = "Enter date of birth.";
  } else if (newPatient.dateOfBirth > todayIsoLocal()) {
    next.dateOfBirth = "Date of birth cannot be in the future.";
  }
  if (!newPatient.gender) next.gender = "Select gender.";
  if (!String(newPatient.address1 || "").trim()) next.address1 = "Enter address 1.";
  const cityErr = personNameError(newPatient.city, "city");
  if (cityErr) next.city = cityErr;
  if (!newPatient.state) next.state = "Select state.";
  const zipErr = zipCodeError(newPatient.zipCode);
  if (zipErr) next.zipCode = zipErr;
  const phoneDigits = digitsOnly(newPatient.phone);
  if (!phoneDigits) {
    next.phone = "Enter cell phone.";
  } else if (phoneDigits.length !== CELL_PHONE_DIGITS) {
    next.phone = `Enter a ${CELL_PHONE_DIGITS}-digit cell phone number.`;
  } else if (isAllSameDigit(phoneDigits)) {
    next.phone = "Enter a valid cell phone number (not all the same digit).";
  }
  return next;
}

export const SCHEDULE_TYPES = [{ value: "1", label: "Once" }];

export const emptyForm = {
  patientId: "",
  accountNo: "",
  ssn: "",
  dateOfBirth: "",
  age: "",
  gender: "",
  locationId: "",
  date: "",
  resourceId: "",
  visitTypeId: "",
  startTime: "",
  duration: "15",
  statusId: "1",
  scheduleTypeId: "1",
  notes: "",
  employerName: "",
};

export function emptyVisit() {
  return {
    locationId: "",
    date: "",
    visitTypeId: "",
    duration: "15",
    resourceId: "",
    startTime: "",
    statusId: "1",
    notes: "",
  };
}

export function ageFromDob(isoDate) {
  if (!isoDate) return "";
  const dob = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(dob.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age >= 0 ? String(age) : "";
}

export function timeToMinutes(hhmmss) {
  const parts = String(hhmmss || "").split(":");
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

export function rangesOverlap(startA, durationA, startB, durationB) {
  const a1 = timeToMinutes(startA);
  const b1 = timeToMinutes(startB);
  if (a1 == null || b1 == null) return false;
  const a2 = a1 + Number(durationA || 0);
  const b2 = b1 + Number(durationB || 0);
  return a1 < b2 && b1 < a2;
}

/** Hide API slots already reserved in the unsaved bulk list (same location/date/provider). */
export function isSlotHeldByDrafts(slotStart, form, drafts) {
  return drafts.some(
    (row) =>
      String(row.locationId) === String(form.locationId) &&
      String(row.date) === String(form.date) &&
      String(row.resourceId) === String(form.resourceId) &&
      rangesOverlap(
        slotStart,
        form.duration,
        row.startTime,
        row.duration
      )
  );
}

export function providerCacheKey(locationId, date) {
  if (!locationId || !date) return null;
  return `${locationId}|${date}`;
}

export function slotCacheKey(locationId, date, resourceId, duration) {
  if (!locationId || !date || !resourceId || !duration) return null;
  return `${locationId}|${date}|${resourceId}|${duration}`;
}

export function slotConflictKey(date, resourceId, startTime) {
  if (!date || !resourceId || !startTime) return null;
  return `${date}|${resourceId}|${startTime}`;
}

export function sortVisitTypeOptions(visitTypes) {
  const categoryOrder = {
    Injury: 1,
    Physical: 2,
    "Drug Screen": 3,
    "Urgent Care": 4,
    "Personal Injury": 5,
  };
  return [...visitTypes]
    .sort((a, b) => {
      const ca = categoryOrder[a.category] ?? 99;
      const cb = categoryOrder[b.category] ?? 99;
      if (ca !== cb) return ca - cb;
      return String(a.name || "").localeCompare(String(b.name || ""));
    })
    .map((vt) => ({
      value: String(vt.id),
      label: vt.label || vt.name,
    }));
}
