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

# Default / home portal when no login-page portal is specified.
USER_TYPE_PORTAL: dict[UserType, str] = {
    UserType.SuperAdmin: "employer",
    UserType.EmployerUser: "employer",
    UserType.PatientUser: "patient",
    UserType.InsuranceUser: "insurance",
}

# Portals each TypeId may sign into (Super Admin may use all three).
USER_TYPE_ALLOWED_PORTALS: dict[UserType, frozenset[str]] = {
    UserType.SuperAdmin: frozenset({"employer", "patient", "insurance"}),
    UserType.EmployerUser: frozenset({"employer"}),
    UserType.PatientUser: frozenset({"patient"}),
    UserType.InsuranceUser: frozenset({"insurance"}),
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
    """Return default portal key for a portal-enabled TypeId, else None."""
    if type_id is None:
        return None
    try:
        user_type = UserType(int(type_id))
    except (TypeError, ValueError):
        return None
    return USER_TYPE_PORTAL.get(user_type)


def portals_allowed_for_type_id(type_id: int | None) -> frozenset[str]:
    """Return the set of portals this TypeId may sign into."""
    if type_id is None:
        return frozenset()
    try:
        user_type = UserType(int(type_id))
    except (TypeError, ValueError):
        return frozenset()
    return USER_TYPE_ALLOWED_PORTALS.get(user_type, frozenset())


# Back-compat alias used by earlier branch code.
portals_for_type_id = portals_allowed_for_type_id


def resolve_login_portal(type_id: int | None, requested_portal: str | None) -> str:
    """
    Validate requested portal against TypeId allow-list.

    Super Admin → employer, patient, or insurance
    Employer User → employer only
    Patient User → patient only
    Insurance User → insurance only
    """
    allowed = portals_allowed_for_type_id(type_id)
    if not allowed:
        raise ValueError("portal_disabled")

    expected = (requested_portal or "").strip().lower() or None
    if expected in {"employer", "patient", "insurance"}:
        if expected not in allowed:
            home = portal_for_type_id(type_id) or sorted(allowed)[0]
            raise ValueError(f"portal_mismatch:{home}")
        return expected

    return portal_for_type_id(type_id) or sorted(allowed)[0]
