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

# Primary portal used when login request does not specify one.
USER_TYPE_PORTAL: dict[UserType, str] = {
    UserType.SuperAdmin: "employer",
    UserType.EmployerUser: "employer",
    UserType.PatientUser: "patient",
    UserType.InsuranceUser: "insurance",
}

# Portals each TypeId may sign into (Super Admin can use employer + insurance).
USER_TYPE_ALLOWED_PORTALS: dict[UserType, frozenset[str]] = {
    UserType.SuperAdmin: frozenset({"employer", "insurance"}),
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


def portals_for_type_id(type_id: int | None) -> frozenset[str]:
    """Return the set of portals a TypeId may access."""
    if type_id is None:
        return frozenset()
    try:
        user_type = UserType(int(type_id))
    except (TypeError, ValueError):
        return frozenset()
    return USER_TYPE_ALLOWED_PORTALS.get(user_type, frozenset())


def portal_for_type_id(type_id: int | None) -> str | None:
    """Return the primary portal for a TypeId, else None.

    Super Admin / Employer User → employer (primary).
    Insurance User → insurance.
    Patient User → patient.
    """
    if type_id is None:
        return None
    try:
        user_type = UserType(int(type_id))
    except (TypeError, ValueError):
        return None
    return USER_TYPE_PORTAL.get(user_type)


def resolve_login_portal(type_id: int | None, requested_portal: str | None) -> str:
    """
    Resolve which portal the session belongs to after login.

    If a portal is requested, it must be allowed for the TypeId.
    Otherwise the primary portal for that TypeId is used.
    """
    allowed = portals_for_type_id(type_id)
    if not allowed:
        raise ValueError("not_enabled")

    expected = (requested_portal or "").strip().lower() or None
    if expected in {"employer", "patient", "insurance"}:
        if expected not in allowed:
            raise ValueError("wrong_portal")
        return expected

    primary = portal_for_type_id(type_id)
    if primary is None:
        raise ValueError("not_enabled")
    return primary
