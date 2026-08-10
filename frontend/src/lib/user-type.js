/** UserProfiles.TypeId display labels (PascalCase → spaced words). */

export const UserType = Object.freeze({
  SuperAdmin: 0,
  SystemUser: 1,
  EmployerUser: 2,
  PharmacyUser: 3,
  LabUser: 4,
  InsuranceUser: 5,
  ExternalUser: 6,
  PatientUser: 7,
});

export const USER_TYPE_LABELS = Object.freeze({
  [UserType.SuperAdmin]: "Super Admin",
  [UserType.SystemUser]: "System User",
  [UserType.EmployerUser]: "Employer User",
  [UserType.PharmacyUser]: "Pharmacy User",
  [UserType.LabUser]: "Lab User",
  [UserType.InsuranceUser]: "Insurance User",
  [UserType.ExternalUser]: "External User",
  [UserType.PatientUser]: "Patient User",
});

/** Must match backend app.auth.user_profile_type.ALL_PORTALS */
export const ALL_PORTALS = Object.freeze(["employer", "patient", "insurance"]);

/** Must match backend USER_TYPE_ALLOWED_PORTALS (Super Admin → employer only). */
export const USER_TYPE_ALLOWED_PORTALS = Object.freeze({
  [UserType.SuperAdmin]: Object.freeze(["employer"]),
  [UserType.EmployerUser]: Object.freeze(["employer"]),
  [UserType.PatientUser]: Object.freeze(["patient"]),
  [UserType.InsuranceUser]: Object.freeze(["insurance"]),
});

export function userTypeLabel(typeId) {
  if (typeId == null || typeId === "") return null;
  const id = Number(typeId);
  if (!Number.isFinite(id)) return null;
  return USER_TYPE_LABELS[id] ?? null;
}

export function isSuperAdmin(typeId) {
  return Number(typeId) === UserType.SuperAdmin;
}

export function portalsAllowedForTypeId(typeId) {
  const id = Number(typeId);
  if (!Number.isFinite(id)) return [];
  return USER_TYPE_ALLOWED_PORTALS[id] || [];
}

export function canAccessPortal(typeId, portal) {
  const expected = String(portal || "")
    .trim()
    .toLowerCase();
  if (!ALL_PORTALS.includes(expected)) return false;
  return portalsAllowedForTypeId(typeId).includes(expected);
}
