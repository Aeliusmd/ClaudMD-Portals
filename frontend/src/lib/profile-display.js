/** Build the header / profile display name from first + last, then fullName. */
export function displayFullName(profile) {
  if (!profile) return "";
  const first = String(profile.firstName || profile.first_name || "").trim();
  const last = String(profile.lastName || profile.last_name || "").trim();
  const joined = [first, last].filter(Boolean).join(" ");
  if (joined) return joined;
  return String(
    profile.fullName || profile.full_name || profile.name || ""
  ).trim();
}
