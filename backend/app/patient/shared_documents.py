"""Resolve secure shared-document links for patient recipients.

Access: SharedDocuments recipient (Email / ShareWithUserId) AND the document
visit must belong to the logged-in patient's own chart (CheckInsHeader.PatientId).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from fastapi.responses import FileResponse, Response

from app.auth.dependencies import CurrentUser
from app.db.clinic import (
    get_clinic_by_activation_key,
    get_clinic_connection,
    shared_documents_has_is_viewed,
)
from app.employer.schemas import (
    SharedDocumentDetailResponse,
    SharedDocumentEmployee,
)
from app.employer.visit_documents import render_pdf_first_page_png
from app.patient.notifications import _recipient_clause
from app.patient.profile import PatientProfile, fetch_profile_from_clinic
from app.patient.service import _format_display_date


_CHECKIN_OBJECT_TYPE_ID = 53
_SHARED_DOC_UPLOAD_TYPE_ID = 2


def get_shared_document_detail(
    current_user: CurrentUser,
    shared_id: str,
) -> SharedDocumentDetailResponse:
    clinic, profile, row = _load_shared_document_access(current_user, shared_id)
    _mark_shared_id_viewed(clinic, profile, str(row.get("SharedId") or shared_id))
    return _to_detail_response(row)


def open_shared_document_file(
    current_user: CurrentUser,
    shared_id: str,
) -> FileResponse:
    clinic, profile, row = _load_shared_document_access(current_user, shared_id)
    _mark_shared_id_viewed(clinic, profile, str(row.get("SharedId") or shared_id))
    pdf_path = _resolve_upload_pdf_path(row)
    if pdf_path is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document file is not available on the share path.",
        )
    return FileResponse(
        path=str(pdf_path),
        media_type="application/pdf",
        filename=pdf_path.name,
        content_disposition_type="inline",
    )


def open_shared_document_thumbnail(
    current_user: CurrentUser,
    shared_id: str,
) -> Response:
    row = _require_shared_document_row(current_user, shared_id)
    pdf_path = _resolve_upload_pdf_path(row)
    if pdf_path is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document preview is not available.",
        )
    try:
        png_bytes = render_pdf_first_page_png(pdf_path)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document preview is not available.",
        ) from exc
    return Response(content=png_bytes, media_type="image/png")


def _parse_shared_id(shared_id: str) -> str:
    raw = (shared_id or "").strip()
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="sharedid is required.",
        )
    try:
        return str(UUID(raw))
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="sharedid must be a valid UUID.",
        ) from exc


def _require_shared_document_row(
    current_user: CurrentUser,
    shared_id: str,
) -> dict[str, Any]:
    _, _, row = _load_shared_document_access(current_user, shared_id)
    return row


def _gender_label(gender_id) -> str | None:
    if gender_id is None:
        return None
    try:
        gid = int(gender_id)
    except (TypeError, ValueError):
        return None
    if gid == 1:
        return "Male"
    if gid == 2:
        return "Female"
    return None


def _load_shared_document_access(
    current_user: CurrentUser,
    shared_id: str,
) -> tuple[Any, PatientProfile, dict[str, Any]]:
    shared_uuid = _parse_shared_id(shared_id)
    clinic = get_clinic_by_activation_key(current_user.activation_key)
    if not clinic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Clinic not found for this session.",
        )

    profile = fetch_profile_from_clinic(clinic, current_user)
    if profile.patient_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Patient chart not found for this user.",
        )

    email_norm = (profile.email or "").strip().lower() or None
    recipient_sql, recipient_params = _recipient_clause(profile.user_id, email_norm)

    sql = f"""
        SELECT TOP (1)
            CONVERT(varchar(36), sd.SharedId) AS SharedId,
            sd.Id AS ShareRowId,
            sd.DocumentId,
            sd.Email AS ShareEmail,
            sd.ShareWithUserId,
            du.FileName,
            du.FilePath,
            du.FileExtention,
            du.ReportId,
            r.Name AS ReportName,
            r.ReportTitle,
            ch.Id AS CheckInId,
            ch.PatientId,
            CONVERT(varchar(10), ch.CheckInDate, 23) AS VisitDate,
            vt.Description AS VisitTypeDescription,
            vt.Code AS VisitTypeCode,
            p.FirstName,
            p.LastName,
            p.AccountNumber,
            p.GenderId,
            CONVERT(varchar(10), p.DateOfBirth, 23) AS DateOfBirth,
            p.CellPhone,
            p.HomePhone,
            p.WorkPhone,
            p.Address1,
            p.Address2,
            p.City,
            p.State,
            p.ZipCode
        FROM dbo.SharedDocuments sd
        INNER JOIN dbo.DocumentUploads du
            ON du.Id = sd.DocumentId
           AND sd.DocumentTypeId = ?
           AND (du.IsDeleted = 0 OR du.IsDeleted IS NULL)
        LEFT JOIN dbo.Reports r ON r.Id = du.ReportId
        LEFT JOIN dbo.CheckInsHeader ch
            ON ch.Id = du.HeaderObjectId
           AND du.ObjectTypeId = ?
           AND (ch.IsDeleted = 0 OR ch.IsDeleted IS NULL)
        LEFT JOIN dbo.VisitTypes vt ON vt.Id = ch.VisitTypeId
        LEFT JOIN dbo.Patients p ON p.Id = ch.PatientId
        WHERE sd.SharedId = ?
          AND (sd.IsDeleted = 0 OR sd.IsDeleted IS NULL)
          AND ({recipient_sql})
          AND ch.PatientId = ?
    """
    params: list[Any] = [
        _SHARED_DOC_UPLOAD_TYPE_ID,
        _CHECKIN_OBJECT_TYPE_ID,
        shared_uuid,
        *recipient_params,
        int(profile.patient_id),
    ]

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(sql, tuple(params))
        columns = [col[0] for col in cursor.description]
        fetched = cursor.fetchone()
        if not fetched:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Shared document not found for this account.",
            )
        return clinic, profile, dict(zip(columns, fetched))


def _mark_shared_id_viewed(
    clinic,
    profile: PatientProfile,
    shared_id: str,
) -> int:
    if not shared_documents_has_is_viewed(clinic):
        return 0

    shared_uuid = _parse_shared_id(shared_id)
    email_norm = (profile.email or "").strip().lower() or None
    recipient_sql, recipient_params = _recipient_clause(
        profile.user_id, email_norm, alias=""
    )
    if recipient_sql == "1 = 0":
        return 0

    actor_id = int(profile.user_id) if profile.user_id is not None else 0
    sql = f"""
        UPDATE dbo.SharedDocuments
        SET IsViewed = 1,
            UpdatedDateTime = SYSUTCDATETIME(),
            UpdatedUserId = ?
        WHERE SharedId = ?
          AND (IsDeleted = 0 OR IsDeleted IS NULL)
          AND (IsViewed = 0 OR IsViewed IS NULL)
          AND ({recipient_sql})
    """
    params: list[Any] = [actor_id, shared_uuid, *recipient_params]

    with get_clinic_connection(clinic) as conn:
        cursor = conn.cursor()
        cursor.execute(sql, tuple(params))
        return int(cursor.rowcount or 0)


def _resolve_upload_pdf_path(row: dict[str, Any]) -> Path | None:
    folder_or_file = (row.get("FilePath") or "").strip()
    if not folder_or_file:
        return None

    normalized = folder_or_file.replace("/", "\\").strip()
    root = Path(normalized)
    file_name = (row.get("FileName") or "").strip()

    try:
        if root.is_file():
            return root
        if root.is_dir() and file_name:
            candidate = root / file_name
            if candidate.is_file():
                return candidate
            wanted = file_name.lower()
            for entry in root.iterdir():
                if entry.is_file() and entry.name.lower() == wanted:
                    return entry
    except OSError:
        return None

    return None


def _patient_display_name(first_name: Any, last_name: Any) -> str:
    first = (first_name or "").strip()
    last = (last_name or "").strip()
    return " ".join(part for part in [first, last] if part).strip() or "Patient"


def _to_detail_response(row: dict[str, Any]) -> SharedDocumentDetailResponse:
    report = (
        (row.get("ReportTitle") or "").strip()
        or (row.get("ReportName") or "").strip()
        or (row.get("FileName") or "").strip()
        or "Shared document"
    )
    visit_label = (
        (row.get("VisitTypeDescription") or "").strip()
        or (row.get("VisitTypeCode") or "").strip()
        or "Visit"
    )
    phone = (
        (row.get("CellPhone") or "").strip()
        or (row.get("HomePhone") or "").strip()
        or (row.get("WorkPhone") or "").strip()
        or None
    )
    address_parts = [
        (row.get("Address1") or "").strip(),
        (row.get("Address2") or "").strip(),
        (row.get("City") or "").strip(),
        (row.get("State") or "").strip(),
        (row.get("ZipCode") or "").strip(),
    ]
    address = ", ".join(part for part in address_parts if part) or None
    patient_id = row.get("PatientId")
    account = row.get("AccountNumber")
    account_no = str(account).strip() if account is not None else None

    return SharedDocumentDetailResponse(
        shared_id=str(row.get("SharedId") or "").strip(),
        document_id=int(row["DocumentId"]),
        document_type=report,
        report_title=report,
        file_name=(row.get("FileName") or "").strip() or None,
        visit_date=_format_display_date(row.get("VisitDate")),
        visit_label=visit_label,
        employee=SharedDocumentEmployee(
            patient_id=int(patient_id) if patient_id is not None else None,
            name=_patient_display_name(row.get("FirstName"), row.get("LastName")),
            account_no=account_no,
            date_of_birth=_format_display_date(row.get("DateOfBirth")),
            gender=_gender_label(row.get("GenderId")),
            phone=phone,
            address=address,
        ),
    )
