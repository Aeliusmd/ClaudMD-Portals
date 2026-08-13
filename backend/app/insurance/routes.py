from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import FileResponse

from app.auth.dependencies import CurrentUser, get_current_user
from app.validation.text import sanitize_search_query
from app.insurance.notifications import (
    DEFAULT_PAGE_SIZE as NOTIF_DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE as NOTIF_MAX_PAGE_SIZE,
    list_notifications,
    mark_notifications_read,
)
from app.insurance.patient_detail import get_patient_detail, open_insurance_visit_document_file, open_insurance_visit_document_thumbnail
from app.insurance.patients import (
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    default_search_date_range,
    search_patients,
)
from app.insurance.permissions import (
    get_organization_users,
    update_organization_user_access,
)
from app.insurance.schemas import (
    InsuranceDashboardSummaryResponse,
    InsuranceMarkNotificationsReadResponse,
    InsuranceNotificationsResponse,
    InsuranceOrganizationUserAccessUpdateRequest,
    InsuranceOrganizationUserAccessUpdateResponse,
    InsuranceOrganizationUsersResponse,
    InsurancePatientDetailResponse,
    InsurancePatientSearchResponse,
    InsuranceProfileResponse,
    InsuranceProfileUpdateRequest,
)
from app.employer.schemas import (
    SharedDocumentDetailResponse,
    SupportClinicInfoResponse,
    SupportMessageDetail,
    SupportMessagesResponse,
    SupportRecipientsResponse,
    SupportSendResponse,
)
from app.insurance.service import (
    get_dashboard_summary,
    get_insurance_profile,
    update_insurance_profile,
)
from app.insurance.shared_documents import (
    get_shared_document_detail,
    open_shared_document_file,
    open_shared_document_thumbnail,
)
from app.insurance.support import (
    get_support_clinic_info,
    get_support_message,
    list_support_messages,
    list_support_recipients,
    send_support_message,
)

router = APIRouter(prefix="/api/insurance", tags=["insurance"])


@router.get("/me", response_model=InsuranceProfileResponse)
def insurance_profile_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Logged-in Insurance User profile (UserProfiles + InsuranceContacts)."""
    return get_insurance_profile(current_user)


@router.patch("/me", response_model=InsuranceProfileResponse)
def insurance_profile_update_endpoint(
    payload: InsuranceProfileUpdateRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """
    Update editable profile fields on UserProfiles + InsuranceContacts.
    LoginId / TypeId / organization / address are not changed.
    """
    return update_insurance_profile(current_user, payload)


@router.get("/dashboard/summary", response_model=InsuranceDashboardSummaryResponse)
def insurance_dashboard_summary_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """
    Last-30-day KPI counts for the logged-in user's insurance company:
    Workers Comp patients, Private Insurance patients, unread shared reports.
    """
    return get_dashboard_summary(current_user)


@router.get(
    "/organization-users",
    response_model=InsuranceOrganizationUsersResponse,
)
def insurance_organization_users_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """
    Insurance organization contacts for the Permissions tab.
    Admin only (UserGroupId = 11). Roles from TypeId + UserGroupId.
    """
    return get_organization_users(current_user)


@router.patch(
    "/organization-users/{contact_id}/access",
    response_model=InsuranceOrganizationUserAccessUpdateResponse,
)
def insurance_organization_user_access_endpoint(
    contact_id: int,
    payload: InsuranceOrganizationUserAccessUpdateRequest,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """
    Grant / modify / revoke portal access for an insurance contact.
    Admin only. Updates InsuranceContacts.IsAllowPortalAccess (existing column).
    """
    return update_organization_user_access(
        current_user,
        contact_id,
        payload.access_level,
    )


@router.get("/notifications", response_model=InsuranceNotificationsResponse)
def insurance_notifications_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(
        default=NOTIF_DEFAULT_PAGE_SIZE,
        ge=1,
        le=NOTIF_MAX_PAGE_SIZE,
        alias="pageSize",
    ),
):
    """
    In-app notification feed (SELECT only) for the last 30 days, paginated.
    Sources: SharedDocuments, appointments, EHRWorkStatuses for this insurance.
    """
    return list_notifications(current_user, page=page, page_size=page_size)


@router.post(
    "/notifications/mark-read",
    response_model=InsuranceMarkNotificationsReadResponse,
)
def insurance_notifications_mark_read_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Mark SharedDocuments.IsViewed = 1 for shares addressed to this user."""
    return mark_notifications_read(current_user)


@router.get("/patients/search", response_model=InsurancePatientSearchResponse)
def insurance_patient_search_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    from_date: date | None = Query(default=None, alias="fromDate"),
    to_date: date | None = Query(default=None, alias="toDate"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(
        default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE, alias="pageSize"
    ),
    search: str | None = Query(default=None),
    coverage: str = Query(
        default="workers_comp",
        description="workers_comp (EmployerId set) or private (EmployerId null)",
    ),
):
    """
    Unique patients from CheckInsHeader for this insurer + coverage type.
    Workers Comp: InsuranceId match AND EmployerId IS NOT NULL.
    Private: InsuranceId match AND EmployerId IS NULL.
    SELECT only; server-side pagination.
    """
    default_from, default_to = default_search_date_range()
    start = from_date or default_from
    end = to_date or default_to
    return search_patients(
        current_user,
        start,
        end,
        coverage=coverage,
        page=page,
        page_size=page_size,
        search=sanitize_search_query(search),
    )


@router.get("/patients/{patient_id}", response_model=InsurancePatientDetailResponse)
def insurance_patient_detail_endpoint(
    patient_id: int,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    from_date: date | None = Query(default=None, alias="fromDate"),
    to_date: date | None = Query(default=None, alias="toDate"),
    coverage: str | None = Query(
        default=None,
        description="Optional: workers_comp or private — scopes EmployerId filter",
    ),
):
    """
    Patient demographics + visit history + published documents for this insurer.
    SELECT only. Patient must have CheckInsHeader rows with matching InsuranceId.
    Pass coverage=private for Private Insurance detail (no employer).
    """
    return get_patient_detail(
        current_user,
        patient_id,
        from_date=from_date,
        to_date=to_date,
        coverage=coverage,
    )


@router.get("/patients/{patient_id}/visit-documents/{document_id}/file")
def insurance_patient_visit_document_file_endpoint(
    patient_id: int,
    document_id: int,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> FileResponse:
    """Stream a DocterPublishes PDF from the clinic publish share (read-only)."""
    return open_insurance_visit_document_file(
        current_user,
        patient_id,
        document_id,
    )


@router.get("/patients/{patient_id}/visit-documents/{document_id}/thumbnail")
def insurance_patient_visit_document_thumbnail_endpoint(
    patient_id: int,
    document_id: int,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """PNG of the first PDF page for insurance visit document tiles."""
    return open_insurance_visit_document_thumbnail(
        current_user,
        patient_id,
        document_id,
    )


@router.get(
    "/shared-documents/by-shared-id/{shared_id}",
    response_model=SharedDocumentDetailResponse,
)
def insurance_shared_document_detail_endpoint(
    shared_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """
    Resolve a secure share link for insurance: SharedId → DocumentUploads,
    scoped to patients under this insurance company.
    """
    return get_shared_document_detail(current_user, shared_id)


@router.get("/shared-documents/by-shared-id/{shared_id}/file")
def insurance_shared_document_file_endpoint(
    shared_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> FileResponse:
    """Stream the PDF from DocumentUploads.FilePath for a SharedId link."""
    return open_shared_document_file(current_user, shared_id)


@router.get("/shared-documents/by-shared-id/{shared_id}/thumbnail")
def insurance_shared_document_thumbnail_endpoint(
    shared_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """PNG of page 1 for a SharedId document tile."""
    return open_shared_document_thumbnail(current_user, shared_id)


@router.get("/support/clinic", response_model=SupportClinicInfoResponse)
def insurance_support_clinic_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Support compose context (logged-in user as From)."""
    return get_support_clinic_info(current_user)


@router.get("/support/recipients", response_model=SupportRecipientsResponse)
def insurance_support_recipients_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    search: str | None = Query(default=None),
):
    """Clinic staff users available for To / CC (internal messaging)."""
    return list_support_recipients(current_user, search=search)


@router.get("/support/messages", response_model=SupportMessagesResponse)
def insurance_support_messages_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=50, alias="pageSize"),
):
    """Inbox of MailInboxes rows for the logged-in insurance user."""
    return list_support_messages(current_user, page=page, page_size=page_size)


@router.get("/support/messages/{message_id}", response_model=SupportMessageDetail)
def insurance_support_message_detail_endpoint(
    message_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    return get_support_message(current_user, message_id)


@router.post("/support/messages", response_model=SupportSendResponse)
async def insurance_support_send_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    to_user_id: Annotated[int, Form(alias="toUserId")],
    subject: Annotated[str, Form()],
    body: Annotated[str, Form()],
    cc_user_ids: Annotated[str | None, Form(alias="ccUserIds")] = None,
    files: Annotated[list[UploadFile] | None, File()] = None,
):
    """
    Compose an internal support message into dbo.MailInboxes (+ attachments).
    Mother-style CC: one MailInboxes row per recipient (To = that user).
    No schema changes.
    """
    parsed_ccs: list[int] = []
    if cc_user_ids:
        for part in str(cc_user_ids).split(","):
            part = part.strip()
            if not part:
                continue
            try:
                parsed_ccs.append(int(part))
            except ValueError:
                continue

    return await send_support_message(
        current_user,
        to_user_id=to_user_id,
        cc_user_ids=parsed_ccs,
        subject=subject,
        body=body,
        files=list(files or []),
    )
