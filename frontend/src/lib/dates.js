/** Mock records carry display dates ("Jul 18, 2026"); range filters need sortable ISO. */
export function toIsoDate(displayDate) {
  if (!displayDate) return null;
  const parsed = parseDisplayDate(displayDate);
  if (!parsed) return null;

  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${parsed.getFullYear()}-${month}-${day}`;
}

export function shiftIsoDate(isoDate, days) {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isWithinRange(isoDate, fromIso, toIso) {
  if (!isoDate) return true;
  if (fromIso && isoDate < fromIso) return false;
  if (toIso && isoDate > toIso) return false;
  return true;
}

/** Parse ISO, slash dates, and common display strings into a local Date. */
export function parseDisplayDate(value) {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    let year = Number(slash[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const date = new Date(year, month - 1, day, 12, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const [year, month, day] = raw.slice(0, 10).split("-").map(Number);
    const date = new Date(year, month - 1, day, 12, 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(raw.includes("T") ? raw : `${raw} 12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Standard portal display date: mm/dd/yy */
export function formatDateMMDDYY(value) {
  const date = parseDisplayDate(value);
  if (!date) return value == null || value === "" ? "" : String(value).trim();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

/** Date of birth and similar fields: mm/dd/yyyy */
export function formatDateMMDDYYYY(value) {
  const date = parseDisplayDate(value);
  if (!date) return value == null || value === "" ? "" : String(value).trim();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

export function formatDateOfBirth(value) {
  if (!value) return "—";
  const formatted = formatDateMMDDYYYY(value);
  return formatted || "—";
}

/**
 * Parse datetimes from API/SQL Server, including odd fractional seconds
 * and short offsets like `2026-08-07T03:47:02.8171970+00`.
 */
export function parseDateTime(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const raw = String(value).trim();
  if (!raw) return null;

  let date = new Date(raw);
  if (!Number.isNaN(date.getTime())) return date;

  const normalized = raw
    .replace(/(\.\d{3})\d+/, "$1")
    .replace(/([+-]\d{2})$/, "$1:00")
    .replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  date = new Date(normalized);
  if (!Number.isNaN(date.getTime())) return date;

  const match = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/
  );
  if (match) {
    date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6] || 0)
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/** Visit-doc version stamp: MM/DD/YY  HH:MM AM/PM (zero-padded hour, double space). */
export function formatDateTimeCompactMMDDYY(value) {
  if (!value) return "";
  const date = parseDateTime(value);
  if (!date) return String(value).trim();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const suffix = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  const hh = String(hours).padStart(2, "0");
  return `${mm}/${dd}/${yy}  ${hh}:${minutes} ${suffix}`;
}

/** Published document timestamp: mm/dd/yy, h:mm AM/PM */
export function formatDateTimeMMDDYY(value) {
  if (!value) return "";
  const date = parseDateTime(value);
  if (!date) return String(value).trim();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const suffix = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${mm}/${dd}/${yy}, ${hours}:${minutes} ${suffix}`;
}

/** "2026-08-15" or API strings → mm/dd/yy */
export function toDisplayDate(isoDate) {
  return formatDateMMDDYY(isoDate);
}

/** "14:30" → "2:30 PM". */
export function toDisplayTime(value) {
  if (!value) return "";
  const [hours, minutes] = value.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return value;
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}
