"""UserProfiles.TypeId → portal access."""

from __future__ import annotations

from enum import IntEnum


class UserProfileType(IntEnum):
    """Clinic UserProfiles.TypeId values used by the portals."""

    Employer = 2
    Patient = 7


USER_PROFILE_TYPE_PORTAL: dict[UserProfileType, str] = {
    UserProfileType.Employer: "employer",
    UserProfileType.Patient: "patient",
}


def portal_for_type_id(type_id: int | None) -> str | None:
    """Return 'employer' / 'patient' for a known TypeId, else None."""
    if type_id is None:
        return None
    try:
        profile_type = UserProfileType(int(type_id))
    except (TypeError, ValueError):
        return None
    return USER_PROFILE_TYPE_PORTAL.get(profile_type)
