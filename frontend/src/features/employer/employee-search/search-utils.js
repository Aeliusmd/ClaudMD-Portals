export function parseDisplayDate(value) {
  if (!value || value === "N/A") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function matchesEmployeeSearch(entry, rawQuery) {
  const normalizedQuery = rawQuery.trim().toLowerCase();
  if (!normalizedQuery) return true;

  const haystack = [
    entry.employeeName,
    entry.accountNo,
    entry.ssnLast4,
    entry.ssn,
    entry.incidentNumber,
    entry.employerName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const tokens = normalizedQuery
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (tokens.length === 0) return true;

  if (tokens.every((token) => haystack.includes(token))) return true;

  const digitsQuery = normalizedQuery.replace(/\D/g, "");
  if (digitsQuery.length >= 4 && entry.ssn) {
    return entry.ssn.replace(/\D/g, "").includes(digitsQuery);
  }

  return false;
}
