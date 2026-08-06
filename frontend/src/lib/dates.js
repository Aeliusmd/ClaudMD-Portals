/** Mock records carry display dates ("Jul 18, 2026"); range filters need sortable ISO. */
export function toIsoDate(displayDate) {
  if (!displayDate) return null;
  const parsed = new Date(`${displayDate} 12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;

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

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-08-15" → "Aug 15, 2026" (matches the display dates in the mock data). */
export function toDisplayDate(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return `${MONTH_LABELS[month - 1]} ${day}, ${year}`;
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
