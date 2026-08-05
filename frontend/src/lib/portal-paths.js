/** Single source of truth for portal URL prefixes (no /employer vs /employerportal split). */

export const EMPLOYER_PORTAL_BASE = "/employerportal";
export const PATIENT_PORTAL_BASE = "/patientportal";

export const EMPLOYER_LOGIN_PATH = `${EMPLOYER_PORTAL_BASE}/authentication/login`;
export const PATIENT_LOGIN_PATH = `${PATIENT_PORTAL_BASE}/authentication/login`;

/** Default login used by shared entry points (root, /login, logout). */
export const LOGIN_PATH = EMPLOYER_LOGIN_PATH;

export const employerPaths = {
  base: EMPLOYER_PORTAL_BASE,
  login: EMPLOYER_LOGIN_PATH,
  dashboard: `${EMPLOYER_PORTAL_BASE}/dashboard`,
  employeeSearch: `${EMPLOYER_PORTAL_BASE}/employee-search`,
  appointments: `${EMPLOYER_PORTAL_BASE}/appointments`,
  authorizations: `${EMPLOYER_PORTAL_BASE}/authorizations`,
  profile: `${EMPLOYER_PORTAL_BASE}/profile`,
  sharedDocuments: `${EMPLOYER_PORTAL_BASE}/shared-documents`,
  sharedDocumentsScoped: `${EMPLOYER_PORTAL_BASE}/shared-documents/scoped`,
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
};

export function getLoginHref({
  portal = "employer",
  activationKey,
  share,
} = {}) {
  const base =
    portal === "patient" ? PATIENT_LOGIN_PATH : EMPLOYER_LOGIN_PATH;
  const params = new URLSearchParams();
  if (activationKey) params.set("activationkey", activationKey);
  if (share) params.set("share", share);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export function resolvePortalDestination(portal) {
  if (portal === "patient") return patientPaths.dashboard;
  return employerPaths.dashboard;
}
