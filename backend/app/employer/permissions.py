"""Organization users / portal access for Permissions tab.

AuditLogEntries is reserved for a future Permissions activity log (allowlisted
Actions such as UPDATE_EMPLOYERCONTACT / CREATE_EMPLOYER_CONTACT / PORTAL_*).
It must not feed the in-app notification bell — see employer/notifications.py.
"""

from __future__ import annotations

from fastapi import HTTPException, status

from app.auth.dependencies import CurrentUser
from app.auth.user_profile_type import (
    is_employer_admin,
    organization_permission_role,
    user_type_label,
)
from app.db.clinic import get_clinic_by_activation_key, get_clinic_connection
from app.employer.schemas import (
    OrganizationUserAccessUpdateResponse,
    OrganizationUserRow,
    OrganizationUsersResponse,
)
from app.employer.profile import fetch_profile_from_clinic

ACCESS_PORTAL = "Portal Access"
ACCESS_NONE = "No Access"
ALLOWED_ACCESS_LEVELS = {ACCESS_PORTAL, ACCESS_NONE}

# Future Permissions activity log: allowlisted AuditLogEntries.Action values only.
# Do not surface these (or any audit rows) in the notification bell.
PERMISSIONS_AUDIT_ACTIONS = frozenset(
    {
        "UPDATE_EMPLOYERCONTACT",
        "CREATE_EMPLOYER_CONTACT",
        "CREATE_EMPLOYER_USER",
    }
)


def get_organization_users(current_user: CurrentUser) -> OrganizationUsersResponse:
    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )

    profile = fetch_profile_from_clinic(clinic, current_user)
    if profile.employer_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employer not found for this user.",
        )

    if not is_employer_admin(profile.user_group_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only employer admins can view organization users.",
        )

    items = _fetch_organization_users(clinic, profile.employer_id)
    return OrganizationUsersResponse(
        employer_id=profile.employer_id,
        organization=profile.organization,
        items=items,
        total=len(items),
        can_manage_access=True,
    )


def update_organization_user_access(
    current_user: CurrentUser,
    contact_id: int,
    access_level: str,
) -> OrganizationUserAccessUpdateResponse:
    """
    Grant / modify / revoke portal access (EmployerContacts.IsAllowPortalAccess).

    Allowed callers: employer admin (UserProfiles.UserGroupId = 11).
    Does not write AuditLogEntries yet (deferred). When wired, AuditLogEntries
    is for a Permissions activity log only — not the in-app notification bell.
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
    if profile.employer_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employer not found for this user.",
        )

    if not is_employer_admin(profile.user_group_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only employer admins can grant, modify, or revoke portal access.",
        )

    allow_portal = normalized == ACCESS_PORTAL
    _apply_portal_access(
        clinic,
        employer_id=profile.employer_id,
        contact_id=contact_id,
        allow_portal=allow_portal,
        actor_user_id=profile.user_id,
    )

    items = _fetch_organization_users(clinic, profile.employer_id)
    updated = next((item for item in items if item.contact_id == contact_id), None)
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization contact not found after update.",
        )

    return OrganizationUserAccessUpdateResponse(
        item=updated,
        can_manage_access=True,
    )


def _apply_portal_access(
    clinic,
    *,
    employer_id: int,
    contact_id: int,
    allow_portal: bool,
    actor_user_id: int | None,
) -> None:
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()

        cursor.execute(
            """
            SELECT TOP 1
                ec.Id,
                ec.EmployerId,
                ec.IsAllowPortalAccess,
                pa.Id AS PortalAccessId,
                pa.EmployerId AS PortalEmployerId
            FROM dbo.EmployerContacts ec
            LEFT JOIN dbo.EmployerContactPortalAccess pa
                ON pa.EmployerContactId = ec.Id
               AND (pa.IsDeleted = 0 OR pa.IsDeleted IS NULL)
            WHERE ec.Id = ?
              AND (ec.IsDeleted = 0 OR ec.IsDeleted IS NULL)
              AND (
                    ec.EmployerId = ?
                 OR pa.EmployerId = ?
              )
            """,
            (contact_id, employer_id, employer_id),
        )
        row = cursor.fetchone()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization contact not found for this employer.",
            )

        cursor.execute(
            """
            UPDATE dbo.EmployerContacts
            SET IsAllowPortalAccess = ?,
                UpdatedDateTime = SYSDATETIMEOFFSET(),
                UpdatedUserId = ?
            WHERE Id = ?
              AND (IsDeleted = 0 OR IsDeleted IS NULL)
            """,
            (1 if allow_portal else 0, actor_user_id, contact_id),
        )

        if allow_portal:
            if row.PortalAccessId is None:
                cursor.execute(
                    """
                    INSERT INTO dbo.EmployerContactPortalAccess (
                        EmployerContactId,
                        EmployerId,
                        CreatedUserId,
                        CreatedDateTime,
                        UpdatedDateTime,
                        UpdatedUserId,
                        RecordStatusId,
                        IsDeleted
                    )
                    VALUES (?, ?, ?, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET(), ?, 1, 0)
                    """,
                    (contact_id, employer_id, actor_user_id, actor_user_id),
                )
            else:
                cursor.execute(
                    """
                    UPDATE dbo.EmployerContactPortalAccess
                    SET EmployerId = ?,
                        UpdatedDateTime = SYSDATETIMEOFFSET(),
                        UpdatedUserId = ?,
                        RecordStatusId = 1,
                        IsDeleted = 0
                    WHERE Id = ?
                    """,
                    (employer_id, actor_user_id, int(row.PortalAccessId)),
                )
        elif row.PortalAccessId is not None:
            # Soft-revoke portal-access row; keep contact history.
            cursor.execute(
                """
                UPDATE dbo.EmployerContactPortalAccess
                SET IsDeleted = 1,
                    UpdatedDateTime = SYSDATETIMEOFFSET(),
                    UpdatedUserId = ?
                WHERE Id = ?
                """,
                (actor_user_id, int(row.PortalAccessId)),
            )


def _fetch_organization_users(clinic, employer_id: int) -> list[OrganizationUserRow]:
    """
    List EmployerContacts for the employer (SELECT only).

    Role  → Admin when UserProfiles.UserGroupId = 11; otherwise User for org contacts.
            TypeId is also read (employer portal types) via organization_permission_role.
    Access → EmployerContacts.IsAllowPortalAccess (Portal Access / No Access).
    Active → True when a matching UserProfiles row exists.
    """
    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT
                ec.Id AS ContactId,
                ec.FirstName,
                ec.LastName,
                ec.Email,
                ec.UserId,
                ec.IsAllowPortalAccess,
                ec.ContactTypeId,
                ec.ServiceTypeId,
                COALESCE(up_by_id.Id, up_by_email.Id) AS ResolvedUserId,
                COALESCE(up_by_id.TypeId, up_by_email.TypeId) AS TypeId,
                COALESCE(up_by_id.UserGroupId, up_by_email.UserGroupId) AS UserGroupId,
                COALESCE(up_by_id.Title, up_by_email.Title) AS UserTitle,
                COALESCE(up_by_id.LoginId, up_by_email.LoginId) AS LoginId,
                ct.Value AS ContactTypeName,
                st.Value AS ServiceTypeName,
                CASE WHEN pa.Id IS NOT NULL THEN 1 ELSE 0 END AS HasPortalAccessRow
            FROM dbo.EmployerContacts ec
            LEFT JOIN dbo.UserProfiles up_by_id
                ON up_by_id.Id = ec.UserId
               AND (up_by_id.IsDeleted = 0 OR up_by_id.IsDeleted IS NULL)
            LEFT JOIN dbo.UserProfiles up_by_email
                ON ec.UserId IS NULL
               AND ec.Email IS NOT NULL
               AND LTRIM(RTRIM(ec.Email)) <> ''
               AND (
                     LOWER(LTRIM(RTRIM(up_by_email.Email))) = LOWER(LTRIM(RTRIM(ec.Email)))
                  OR LOWER(LTRIM(RTRIM(up_by_email.LoginId))) = LOWER(LTRIM(RTRIM(ec.Email)))
               )
               AND (up_by_email.IsDeleted = 0 OR up_by_email.IsDeleted IS NULL)
               AND up_by_email.RecordStatusId = 1
            LEFT JOIN dbo.EmployerContactPortalAccess pa
                ON pa.EmployerContactId = ec.Id
               AND (pa.IsDeleted = 0 OR pa.IsDeleted IS NULL)
            LEFT JOIN dbo.Enums ct
                ON ct.EnumType = 'ContactType'
               AND ct.EnumTypeId = ec.ContactTypeId
               AND (ct.IsDeleted = 0 OR ct.IsDeleted IS NULL)
            LEFT JOIN dbo.Enums st
                ON st.EnumType = 'ServiceType'
               AND st.EnumTypeId = ec.ServiceTypeId
               AND (st.IsDeleted = 0 OR st.IsDeleted IS NULL)
            WHERE (ec.IsDeleted = 0 OR ec.IsDeleted IS NULL)
              AND (
                    ec.EmployerId = ?
                 OR pa.EmployerId = ?
              )
            ORDER BY
                CASE
                    WHEN COALESCE(up_by_id.UserGroupId, up_by_email.UserGroupId) = 11 THEN 0
                    ELSE 1
                END,
                CASE WHEN ec.IsAllowPortalAccess = 1 THEN 0 ELSE 1 END,
                ec.LastName,
                ec.FirstName,
                ec.Id
            """,
            (employer_id, employer_id),
        )
        rows = cursor.fetchall()

    items: list[OrganizationUserRow] = []
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
            OrganizationUserRow(
                id=f"ec-{contact_id}",
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
                service_type=(row.ServiceTypeName or "").strip() or None,
                has_portal_access_row=bool(row.HasPortalAccessRow),
            )
        )

    return items
