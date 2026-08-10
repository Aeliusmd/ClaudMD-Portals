/**
 * Date range helpers for portal From/To filters (ISO yyyy-mm-dd strings).
 */

/** True when both ends are set and from is after to. */
export function isInvalidDateRange(fromDate, toDate) {
  if (!fromDate || !toDate) return false;
  return String(fromDate) > String(toDate);
}

/**
 * When From moves past To, snap To up to From so the range stays valid.
 */
export function coerceToDate(fromDate, toDate) {
  if (fromDate && toDate && String(toDate) < String(fromDate)) {
    return fromDate;
  }
  return toDate;
}

export const DATE_RANGE_ERROR =
  "To date must be the same day as From date, or a later day.";

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Local calendar date as yyyy-mm-dd. */
export function formatLocalIso(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function todayIso() {
  return formatLocalIso(new Date());
}

/** Inclusive lookback: today minus `days` (e.g. 30 → last 30 days through today). */
export function daysAgoIso(days, fromDate = new Date()) {
  const d = new Date(fromDate);
  d.setDate(d.getDate() - Number(days || 0));
  return formatLocalIso(d);
}

/** Default portal filter window: last 30 days through today. */
export function last30DaysRange() {
  return {
    fromDate: daysAgoIso(30),
    toDate: todayIso(),
  };
}
