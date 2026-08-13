from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.auth.user_profile_type import UserType, user_type_label
from app.db.clinic import get_clinic_connection

_OUTSIDER_PORTAL_TYPES = {int(UserType.ExternalUser)}


@dataclass(frozen=True)
class OutsiderProfile:
    user_id: int | None
    full_name: str
    first_name: str | None
    last_name: str | None
    title: str | None
    email: str | None
    login_id: str | None
    type_id: int | None = None
    type_label: str | None = None


def fetch_profile_from_clinic(clinic, current_user: CurrentUser) -> OutsiderProfile:
    """Read-only profile for external (family/other) shared-document recipients."""
    user_id = current_user.user_id
    login = (current_user.login_id or "").strip()
    email = (current_user.email or login).strip()

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()

        user_row = None
        if user_id is not None:
            cursor.execute(
                """
                SELECT TOP 1
                    Id, LoginId, Email, FirstName, LastName, Title, TypeId
                FROM dbo.UserProfiles
                WHERE Id = ?
                  AND (IsDeleted = 0 OR IsDeleted IS NULL)
                  AND RecordStatusId = 1
                """,
                (int(user_id),),
            )
            user_row = cursor.fetchone()

        if not user_row and login:
            cursor.execute(
                """
                SELECT TOP 1
                    Id, LoginId, Email, FirstName, LastName, Title, TypeId
                FROM dbo.UserProfiles
                WHERE (IsDeleted = 0 OR IsDeleted IS NULL)
                  AND RecordStatusId = 1
                  AND (
                        LOWER(LTRIM(RTRIM(LoginId))) = LOWER(?)
                     OR LOWER(LTRIM(RTRIM(Email))) = LOWER(?)
                  )
                ORDER BY
                    CASE WHEN TypeId = ? THEN 0 ELSE 1 END,
                    Id DESC
                """,
                (
                    login,
                    email,
                    int(UserType.ExternalUser),
                ),
            )
            user_row = cursor.fetchone()

        if not user_row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No active user profile was found for this account.",
            )

        type_id = None
        if user_row.TypeId is not None:
            try:
                type_id = int(user_row.TypeId)
            except (TypeError, ValueError):
                type_id = None

        if type_id not in _OUTSIDER_PORTAL_TYPES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This account is not enabled for the outsider portal.",
            )

        first_name = (user_row.FirstName or "").strip() or None
        last_name = (user_row.LastName or "").strip() or None
        title = (user_row.Title or "").strip() or None
        full_name = " ".join(part for part in [first_name, last_name] if part).strip()
        if not full_name:
            full_name = (user_row.Email or user_row.LoginId or "User").strip()

        return OutsiderProfile(
            user_id=int(user_row.Id),
            full_name=full_name,
            first_name=first_name,
            last_name=last_name,
            title=title,
            email=(user_row.Email or "").strip() or email or None,
            login_id=(user_row.LoginId or "").strip() or login or None,
            type_id=type_id,
            type_label=user_type_label(type_id),
        )
