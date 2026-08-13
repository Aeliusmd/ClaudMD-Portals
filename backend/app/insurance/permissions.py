"""Organization users / portal access for Insurance Permissions tab.

Lists InsuranceContacts for the logged-in user's insurance company.
Admin-only view/manage (UserProfiles.UserGroupId = 11).
Updates existing InsuranceContacts.IsAllowPortalAccess only (no schema changes).
"""

from __future__ import annotations

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.auth.user_profile_type import (
    UserType,
    is_insurance_admin,
    organization_permission_role,
    user_type_label,
)
from app.db.clinic import get_clinic_by_activation_key, get_clinic_connection
from app.insurance.profile import fetch_profile_from_clinic
from app.insurance.schemas import (
    InsuranceOrganizationUserAccessUpdateResponse,
    InsuranceOrganizationUserRow,
    InsuranceOrganizationUsersResponse,
)

ACCESS_PORTAL = "Portal Access"
ACCESS_NONE = "No Access"
ALLOWED_ACCESS_LEVELS = {ACCESS_PORTAL, ACCESS_NONE}


def get_organization_users(
    current_user: CurrentUser,
) -> InsuranceOrganizationUsersResponse:
    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )

    profile = fetch_profile_from_clinic(clinic, current_user)
    if profile.insurance_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Insurance organization not found for this user.",
        )

    if not is_insurance_admin(profile.user_group_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only insurance admins can view organization users.",
        )

    items = _fetch_organization_users(clinic, profile.insurance_id)
    return InsuranceOrganizationUsersResponse(
        insurance_id=profile.insurance_id,
        organization=profile.organization,
        items=items,
        total=len(items),
        can_manage_access=True,
    )


def update_organization_user_access(
    current_user: CurrentUser,
    contact_id: int,
    access_level: str,
) -> InsuranceOrganizationUserAccessUpdateResponse:
    """
    Grant / modify / revoke portal access (InsuranceContacts.IsAllowPortalAccess).
    Allowed callers: insurance admin (UserProfiles.UserGroupId = 11).
    """
    normalized = (access_level or "").strip()
    if normalized not in ALLOWED_ACCESS_LEVELS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"access_level must be '{ACCESS_PORTAL}' or '{ACCESS_NONE}'.",
        )

    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )

    profile = fetch_profile_from_clinic(clinic, current_user)
    if profile.insurance_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Insurance organization not found for this user.",
        )

    if not is_insurance_admin(profile.user_group_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only insurance admins can grant, modify, or revoke portal access.",
        )

    allow_portal = normalized == ACCESS_PORTAL
    _apply_portal_access(
        clinic,
        insurance_id=profile.insurance_id,
        contact_id=contact_id,
        allow_portal=allow_portal,
        actor_user_id=profile.user_id,
    )

    items = _fetch_organization_users(clinic, profile.insurance_id)
    updated = next((item for item in items if item.contact_id == contact_id), None)
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization contact not found after update.",
        )

    return InsuranceOrganizationUserAccessUpdateResponse(
        item=updated,
        can_manage_access=True,
    )


def _apply_portal_access(
    clinic,
    *,
    insurance_id: int,
    contact_id: int,
    allow_portal: bool,
    actor_user_id: int | None,
) -> None:
    with get_clinic_connection(clinic, autocommit=False) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT TOP 1
                ic.Id,
                ic.InsuranceId,
                ic.IsAllowPortalAccess
            FROM dbo.InsuranceContacts ic
            WHERE ic.Id = ?
              AND ic.InsuranceId = ?
              AND (ic.IsDeleted = 0 OR ic.IsDeleted IS NULL)
            """,
            (contact_id, insurance_id),
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization contact not found for this insurance company.",
            )

        cursor.execute(
            """
            UPDATE dbo.InsuranceContacts
            SET IsAllowPortalAccess = ?,
                UpdatedDateTime = SYSDATETIMEOFFSET(),
                UpdatedUserId = ?
            WHERE Id = ?
              AND InsuranceId = ?
              AND (IsDeleted = 0 OR IsDeleted IS NULL)
            """,
            (1 if allow_portal else 0, actor_user_id, contact_id, insurance_id),
        )
        conn.commit()


def _fetch_organization_users(
    clinic,
    insurance_id: int,
) -> list[InsuranceOrganizationUserRow]:
    """
    List InsuranceContacts for the insurance company (SELECT only for list).

    Role  → Admin when UserGroupId = 11; otherwise User.
    Access → InsuranceContacts.IsAllowPortalAccess.
    """
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                ic.Id AS ContactId,
                ic.FirstName,
                ic.LastName,
                ic.Email,
                ic.IsAllowPortalAccess,
                ic.ContactTypeId,
                up.Id AS ResolvedUserId,
                up.TypeId AS TypeId,
                up.UserGroupId AS UserGroupId,
                up.Title AS UserTitle,
                up.LoginId AS LoginId,
                ct.Value AS ContactTypeName
            FROM dbo.InsuranceContacts ic
            LEFT JOIN dbo.UserProfiles up
                ON ic.Email IS NOT NULL
               AND LTRIM(RTRIM(ic.Email)) <> ''
               AND (
                     LOWER(LTRIM(RTRIM(up.Email))) = LOWER(LTRIM(RTRIM(ic.Email)))
                  OR LOWER(LTRIM(RTRIM(up.LoginId))) = LOWER(LTRIM(RTRIM(ic.Email)))
               )
               AND (up.IsDeleted = 0 OR up.IsDeleted IS NULL)
               AND up.RecordStatusId = 1
               AND up.TypeId = ?
            LEFT JOIN dbo.Enums ct
                ON ct.EnumType = 'ContactType'
               AND ct.EnumTypeId = ic.ContactTypeId
               AND (ct.IsDeleted = 0 OR ct.IsDeleted IS NULL)
            WHERE (ic.IsDeleted = 0 OR ic.IsDeleted IS NULL)
              AND ic.InsuranceId = ?
            ORDER BY
                CASE WHEN up.UserGroupId = 11 THEN 0 ELSE 1 END,
                CASE WHEN ic.IsAllowPortalAccess = 1 THEN 0 ELSE 1 END,
                ic.LastName,
                ic.FirstName,
                ic.Id
            """,
            (int(UserType.InsuranceUser), int(insurance_id)),
        )
        rows = cursor.fetchall()

    items: list[InsuranceOrganizationUserRow] = []
    seen_contact_ids: set[int] = set()

    for row in rows:
        contact_id = int(row.ContactId)
        if contact_id in seen_contact_ids:
            continue
        seen_contact_ids.add(contact_id)

        first = (row.FirstName or "").strip()
        last = (row.LastName or "").strip()
        full_name = " ".join(part for part in [first, last] if part).strip()
        email = (row.Email or "").strip() or None
        if not full_name:
            full_name = email or (row.LoginId or "").strip() or f"Contact {contact_id}"

        type_id = None
        if row.TypeId is not None:
            try:
                type_id = int(row.TypeId)
            except (TypeError, ValueError):
                type_id = None

        user_group_id = None
        if row.UserGroupId is not None:
            try:
                user_group_id = int(row.UserGroupId)
            except (TypeError, ValueError):
                user_group_id = None

        allow_portal = bool(row.IsAllowPortalAccess)
        access_level = ACCESS_PORTAL if allow_portal else ACCESS_NONE
        type_label = user_type_label(type_id)
        role_label, is_admin = organization_permission_role(type_id, user_group_id)
        has_user_profile = row.ResolvedUserId is not None

        items.append(
            InsuranceOrganizationUserRow(
                id=f"ic-{contact_id}",
                contact_id=contact_id,
                user_id=int(row.ResolvedUserId) if row.ResolvedUserId is not None else None,
                full_name=full_name,
                email=email,
                title=(row.UserTitle or "").strip() or None,
                login_id=(row.LoginId or "").strip() or None,
                type_id=type_id,
                type_label=type_label,
                user_group_id=user_group_id,
                is_admin=is_admin,
                role=role_label,
                access_level=access_level,
                active=has_user_profile,
                contact_type=(row.ContactTypeName or "").strip() or None,
            )
        )

    return items
