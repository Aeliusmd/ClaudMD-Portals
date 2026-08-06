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

export function userTypeLabel(typeId) {
  if (typeId == null || typeId === "") return null;
  const id = Number(typeId);
  if (!Number.isFinite(id)) return null;
  return USER_TYPE_LABELS[id] ?? null;
}
