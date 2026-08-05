"""UserProfiles.TypeId → portal access + display labels."""

from __future__ import annotations

from enum import IntEnum


class UserType(IntEnum):
    """Clinic UserProfiles.TypeId values."""

    SuperAdmin = 0
    SystemUser = 1
    EmployerUser = 2
    PharmacyUser = 3
    LabUser = 4
    InsuranceUser = 5
    ExternalUser = 6
    PatientUser = 7


# PascalCase → spaced display labels.
USER_TYPE_LABELS: dict[UserType, str] = {
    UserType.SuperAdmin: "Super Admin",
    UserType.SystemUser: "System User",
    UserType.EmployerUser: "Employer User",
    UserType.PharmacyUser: "Pharmacy User",
    UserType.LabUser: "Lab User",
    UserType.InsuranceUser: "Insurance User",
    UserType.ExternalUser: "External User",
    UserType.PatientUser: "Patient User",
}

USER_TYPE_PORTAL: dict[UserType, str] = {
    UserType.EmployerUser: "employer",
    UserType.PatientUser: "patient",
}


# Back-compat aliases used by auth service imports.
UserProfileType = UserType
USER_PROFILE_TYPE_PORTAL = USER_TYPE_PORTAL


def user_type_label(type_id: int | None) -> str | None:
    """Map TypeId to spaced display label, or None if unknown."""
    if type_id is None:
        return None
    try:
        user_type = UserType(int(type_id))
    except (TypeError, ValueError):
        return None
    return USER_TYPE_LABELS.get(user_type)


def portal_for_type_id(type_id: int | None) -> str | None:
    """Return 'employer' / 'patient' for a portal-enabled TypeId, else None."""
    if type_id is None:
        return None
    try:
        user_type = UserType(int(type_id))
    except (TypeError, ValueError):
        return None
    return USER_TYPE_PORTAL.get(user_type)
