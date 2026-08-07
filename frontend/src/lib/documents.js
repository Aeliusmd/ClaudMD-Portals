export const SAMPLE_DOCUMENT_URL = "/sample.pdf";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export function openDocumentInNewTab(url = SAMPLE_DOCUMENT_URL) {
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Build an absolute URL for an authenticated employer visit PDF.
 * PdfThumbnail / preview fetch this with the bearer token and use a blob URL.
 */
export function employerVisitDocumentFileUrl(patientId, documentId) {
  if (patientId == null || documentId == null) return null;
  return `${API_BASE_URL}/api/employer/employees/${encodeURIComponent(
    patientId
  )}/visit-documents/${encodeURIComponent(documentId)}/file`;
}

/**
 * Build an absolute URL for an authenticated insurance visit PDF.
 * Same auth-blob flow as employer via PdfThumbnail / DocumentPreviewModal.
 */
export function insuranceVisitDocumentFileUrl(patientId, documentId) {
  if (patientId == null || documentId == null) return null;
  return `${API_BASE_URL}/api/insurance/patients/${encodeURIComponent(
    patientId
  )}/visit-documents/${encodeURIComponent(documentId)}/file`;
}

export function isApiDocumentUrl(url) {
  if (!url) return false;
  const value = String(url);
  const isVisitFile =
    value.includes("/visit-documents/") && value.endsWith("/file");
  return (
    isVisitFile &&
    (value.includes("/api/employer/employees/") ||
      value.includes("/api/insurance/patients/"))
  );
}

/** Short code stamped on a document thumbnail while its first page renders. */
const badgeByDocumentType = {
  "Clinical Report": "DOC",
  Prescription: "RX",
  Imaging: "IMG",
  "Imaging Report": "IMG",
  "Lab Report": "LAB",
  Referral: "REF",
  "Therapy Plan": "PT",
  "Immunization Record": "IMM",
  "Clearance Form": "CLR",
};

export function documentBadge(type) {
  return badgeByDocumentType[type] || "DOC";
}
