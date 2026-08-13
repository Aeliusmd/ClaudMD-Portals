from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse

from app.auth.dependencies import CurrentUser, get_current_user
from app.employer.schemas import SharedDocumentDetailResponse
from app.outsider.shared_documents import (
    get_shared_document_detail,
    open_shared_document_file,
    open_shared_document_thumbnail,
)

router = APIRouter(prefix="/api/outsider", tags=["outsider"])


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
