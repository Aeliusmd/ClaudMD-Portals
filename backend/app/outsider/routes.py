from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from app.auth.dependencies import CurrentUser, get_current_user
from app.db.clinic import get_clinic_by_activation_key
from app.employer.schemas import SharedDocumentDetailResponse
from app.outsider.profile import fetch_profile_from_clinic
from app.outsider.schemas import (
    MarkSharedDocumentViewedResponse,
    OutsiderProfileResponse,
    SharedDocumentListResponse,
)
from app.outsider.shared_documents import (
    get_shared_document_detail,
    list_shared_documents,
    mark_shared_document_viewed,
    open_shared_document_file,
    open_shared_document_thumbnail,
)

router = APIRouter(prefix="/api/outsider", tags=["outsider"])


@router.get("/me", response_model=OutsiderProfileResponse)
def outsider_profile_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )
    profile = fetch_profile_from_clinic(clinic, current_user)
    return OutsiderProfileResponse(
        user_id=profile.user_id,
        full_name=profile.full_name,
        first_name=profile.first_name,
        last_name=profile.last_name,
        title=profile.title,
        email=profile.email,
        login_id=profile.login_id,
        type_id=profile.type_id,
        type_label=profile.type_label,
    )


@router.get("/shared-documents", response_model=SharedDocumentListResponse)
def outsider_shared_documents_list_endpoint(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Documents shared with this external contact (family/other)."""
    return list_shared_documents(current_user)


@router.get(
    "/shared-documents/by-shared-id/{shared_id}",
    response_model=SharedDocumentDetailResponse,
)
def outsider_shared_document_detail_endpoint(
    shared_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Resolve a secure share link for an external recipient (family/other)."""
    return get_shared_document_detail(current_user, shared_id)


@router.post(
    "/shared-documents/by-shared-id/{shared_id}/viewed",
    response_model=MarkSharedDocumentViewedResponse,
)
def outsider_shared_document_viewed_endpoint(
    shared_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """Mark SharedDocuments.IsViewed = 1 when the contact opens that document."""
    return mark_shared_document_viewed(current_user, shared_id)


@router.get("/shared-documents/by-shared-id/{shared_id}/file")
def outsider_shared_document_file_endpoint(
    shared_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> FileResponse:
    """Stream the PDF from DocumentUploads.FilePath for a SharedId link."""
    return open_shared_document_file(current_user, shared_id)


@router.get("/shared-documents/by-shared-id/{shared_id}/thumbnail")
def outsider_shared_document_thumbnail_endpoint(
    shared_id: str,
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
):
    """PNG of page 1 for a SharedId document tile."""
    return open_shared_document_thumbnail(current_user, shared_id)
