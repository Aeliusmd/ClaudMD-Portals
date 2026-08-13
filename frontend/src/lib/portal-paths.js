/** Single source of truth for portal URL prefixes (no /employer vs /employerportal split). */

export const EMPLOYER_PORTAL_BASE = "/employerportal";
/** Chanuka patient portal keeps the /patient prefix (dummy data UI). */
export const PATIENT_PORTAL_BASE = "/patient";
export const INSURANCE_PORTAL_BASE = "/insuranceportal";

export const EMPLOYER_LOGIN_PATH = `${EMPLOYER_PORTAL_BASE}/authentication/login`;
/** Patient auth pages live under patientportal (from main); portal UI stays on /patient. */
export const PATIENT_LOGIN_PATH = `/patientportal/authentication/login`;
export const INSURANCE_LOGIN_PATH = `${INSURANCE_PORTAL_BASE}/authentication/login`;

/** Prefer portal-specific login paths; generic /login is blocked. */
export const LOGIN_PATH = EMPLOYER_LOGIN_PATH;

export const employerPaths = {
  base: EMPLOYER_PORTAL_BASE,
  login: EMPLOYER_LOGIN_PATH,
  dashboard: `${EMPLOYER_PORTAL_BASE}/dashboard`,
  employeeSearch: `${EMPLOYER_PORTAL_BASE}/employee-search`,
  appointments: `${EMPLOYER_PORTAL_BASE}/appointments`,
  authorizations: `${EMPLOYER_PORTAL_BASE}/authorizations`,
  profile: `${EMPLOYER_PORTAL_BASE}/profile`,
  profilePermissions: `${EMPLOYER_PORTAL_BASE}/profile?tab=permissions`,
  sharedDocuments: `${EMPLOYER_PORTAL_BASE}/shared-documents`,
  sharedDocumentsScoped: `${EMPLOYER_PORTAL_BASE}/shared-documents/scoped`,
  notifications: `${EMPLOYER_PORTAL_BASE}/notifications`,
  support: `${EMPLOYER_PORTAL_BASE}/support`,
};

export const patientPaths = {
  base: PATIENT_PORTAL_BASE,
  login: PATIENT_LOGIN_PATH,
  dashboard: `${PATIENT_PORTAL_BASE}/dashboard`,
  myInformation: `${PATIENT_PORTAL_BASE}/my-information`,
  visits: `${PATIENT_PORTAL_BASE}/visits`,
  appointments: `${PATIENT_PORTAL_BASE}/appointments`,
  documentShare: `${PATIENT_PORTAL_BASE}/document-share`,
  profile: `${PATIENT_PORTAL_BASE}/profile`,
  notifications: `${PATIENT_PORTAL_BASE}/notifications`,
  support: `${PATIENT_PORTAL_BASE}/support`,
  sharedDocumentsScoped: `${PATIENT_PORTAL_BASE}/shared-documents/scoped`,
};

export const insurancePaths = {
  base: INSURANCE_PORTAL_BASE,
  login: INSURANCE_LOGIN_PATH,
  dashboard: `${INSURANCE_PORTAL_BASE}/dashboard`,
  profile: `${INSURANCE_PORTAL_BASE}/profile`,
  profilePermissions: `${INSURANCE_PORTAL_BASE}/profile?tab=permissions`,
  notifications: `${INSURANCE_PORTAL_BASE}/notifications`,
  support: `${INSURANCE_PORTAL_BASE}/support`,
  patients: `${INSURANCE_PORTAL_BASE}/patients`,
  sharedDocumentsScoped: `${INSURANCE_PORTAL_BASE}/shared-documents/scoped`,
};

export function getLoginHref({
  portal = "employer",
  activationKey,
  share,
  sharedId,
} = {}) {
  const base =
    portal === "patient"
      ? PATIENT_LOGIN_PATH
      : portal === "insurance"
        ? INSURANCE_LOGIN_PATH
        : EMPLOYER_LOGIN_PATH;
  const params = new URLSearchParams();
  if (activationKey) params.set("activationkey", activationKey);
  if (share) params.set("share", share);
  if (sharedId) params.set("sharedid", sharedId);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export function resolvePortalDestination(portal) {
  if (portal === "patient") return patientPaths.dashboard;
  if (portal === "insurance") return insurancePaths.dashboard;
  return employerPaths.dashboard;
}

/**
 * Detect portal from the login URL path.
 * /employerportal/... → employer
 * /patientportal/...  → patient
 * /insuranceportal/... or /insurance/... → insurance
 */
export function resolvePortalFromPathname(pathname) {
  const path = String(pathname || "").toLowerCase();
  if (path.includes("/patientportal")) return "patient";
  if (path.includes("/insuranceportal") || path.includes("/insurance/")) {
    return "insurance";
  }
  if (path.includes("/employerportal")) return "employer";
  return null;
}
