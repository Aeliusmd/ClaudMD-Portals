export const SAMPLE_DOCUMENT_URL = "/sample.pdf";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export function openDocumentInNewTab(url = SAMPLE_DOCUMENT_URL) {
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Trigger a file download without opening a new tab (works with blob: URLs). */
export function downloadDocumentUrl(url, filename = "document.pdf") {
  if (!url || typeof document === "undefined") return;

  const safeName =
    String(filename)
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .trim() || "document.pdf";
  const name = safeName.toLowerCase().endsWith(".pdf")
    ? safeName
    : `${safeName}.pdf`;

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
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

/** First-page PNG for employer visit document tiles. */
export function employerVisitDocumentThumbnailUrl(patientId, documentId) {
  if (patientId == null || documentId == null) return null;
  return `${API_BASE_URL}/api/employer/employees/${encodeURIComponent(
    patientId
  )}/visit-documents/${encodeURIComponent(documentId)}/thumbnail`;
}

/** Authenticated PDF for a secure SharedDocuments.SharedId link. */
export function employerSharedDocumentFileUrl(sharedId) {
  if (!sharedId) return null;
  return `${API_BASE_URL}/api/employer/shared-documents/by-shared-id/${encodeURIComponent(
    sharedId
  )}/file`;
}

/** First-page PNG for a secure SharedDocuments.SharedId link. */
export function employerSharedDocumentThumbnailUrl(sharedId) {
  if (!sharedId) return null;
  return `${API_BASE_URL}/api/employer/shared-documents/by-shared-id/${encodeURIComponent(
    sharedId
  )}/thumbnail`;
}

/** Authenticated PDF for insurance secure SharedDocuments.SharedId link. */
export function insuranceSharedDocumentFileUrl(sharedId) {
  if (!sharedId) return null;
  return `${API_BASE_URL}/api/insurance/shared-documents/by-shared-id/${encodeURIComponent(
    sharedId
  )}/file`;
}

/** First-page PNG for insurance secure SharedDocuments.SharedId link. */
export function insuranceSharedDocumentThumbnailUrl(sharedId) {
  if (!sharedId) return null;
  return `${API_BASE_URL}/api/insurance/shared-documents/by-shared-id/${encodeURIComponent(
    sharedId
  )}/thumbnail`;
}

/** Authenticated PDF for patient secure SharedDocuments.SharedId link. */
export function patientSharedDocumentFileUrl(sharedId) {
  if (!sharedId) return null;
  return `${API_BASE_URL}/api/patient/shared-documents/by-shared-id/${encodeURIComponent(
    sharedId
  )}/file`;
}

/** First-page PNG for patient secure SharedDocuments.SharedId link. */
export function patientSharedDocumentThumbnailUrl(sharedId) {
  if (!sharedId) return null;
  return `${API_BASE_URL}/api/patient/shared-documents/by-shared-id/${encodeURIComponent(
    sharedId
  )}/thumbnail`;
}

/** Authenticated PDF for outsider secure SharedDocuments.SharedId link. */
export function outsiderSharedDocumentFileUrl(sharedId) {
  if (!sharedId) return null;
  return `${API_BASE_URL}/api/outsider/shared-documents/by-shared-id/${encodeURIComponent(
    sharedId
  )}/file`;
}

/** First-page PNG for outsider secure SharedDocuments.SharedId link. */
export function outsiderSharedDocumentThumbnailUrl(sharedId) {
  if (!sharedId) return null;
  return `${API_BASE_URL}/api/outsider/shared-documents/by-shared-id/${encodeURIComponent(
    sharedId
  )}/thumbnail`;
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

/** First-page PNG for insurance visit document tiles. */
export function insuranceVisitDocumentThumbnailUrl(patientId, documentId) {
  if (patientId == null || documentId == null) return null;
  return `${API_BASE_URL}/api/insurance/patients/${encodeURIComponent(
    patientId
  )}/visit-documents/${encodeURIComponent(documentId)}/thumbnail`;
}

/**
 * Build an absolute URL for an authenticated patient visit PDF.
 * PdfThumbnail / preview fetch this with the bearer token and use a blob URL.
 */
export function patientVisitDocumentFileUrl(checkInId, documentId) {
  if (checkInId == null || documentId == null) return null;
  return `${API_BASE_URL}/api/patient/visits/${encodeURIComponent(
    checkInId
  )}/documents/${encodeURIComponent(documentId)}/file`;
}

/** First-page PNG for patient visit document tiles. */
export function patientVisitDocumentThumbnailUrl(checkInId, documentId) {
  if (checkInId == null || documentId == null) return null;
  return `${API_BASE_URL}/api/patient/visits/${encodeURIComponent(
    checkInId
  )}/documents/${encodeURIComponent(documentId)}/thumbnail`;
}

export function isApiDocumentUrl(url) {
  if (!url) return false;
  const value = String(url);
  const isSharedDocument =
    (value.includes("/api/employer/shared-documents/by-shared-id/") ||
      value.includes("/api/insurance/shared-documents/by-shared-id/") ||
      value.includes("/api/patient/shared-documents/by-shared-id/") ||
      value.includes("/api/outsider/shared-documents/by-shared-id/")) &&
    (value.endsWith("/file") || value.endsWith("/thumbnail"));
  const isEmployerOrInsurance =
    value.includes("/visit-documents/") &&
    (value.endsWith("/file") || value.endsWith("/thumbnail")) &&
    (value.includes("/api/employer/employees/") ||
      value.includes("/api/insurance/patients/"));
  const isPatient =
    value.includes("/api/patient/visits/") &&
    value.includes("/documents/") &&
    (value.endsWith("/file") || value.endsWith("/thumbnail"));
  return isSharedDocument || isEmployerOrInsurance || isPatient;
}

/** Derive thumbnail URL from a visit document file URL. */
export function visitDocumentThumbnailUrlFromFileUrl(fileUrl) {
  if (!fileUrl || !String(fileUrl).endsWith("/file")) return null;
  return `${String(fileUrl).slice(0, -"/file".length)}/thumbnail`;
}

/**
 * Pull the DocterPublishes id from an API file/thumbnail URL.
 * Employer/insurance: .../visit-documents/{id}/file
 * Patient: .../documents/{id}/file
 */
export function visitDocumentIdFromUrl(url) {
  if (!url) return null;
  const value = String(url);
  const match =
    value.match(/\/visit-documents\/([^/]+)\/(?:file|thumbnail)/i) ||
    value.match(/\/documents\/([^/]+)\/(?:file|thumbnail)/i);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/** In-flight / resolved blob fetches keyed by API URL. */
const blobUrlCache = new Map();

const DOCUMENT_MISSING_MESSAGE = "Document does not exist.";

async function messageFromDocumentResponse(response) {
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  const detail = data?.detail ?? data?.message;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (response.status === 404) return DOCUMENT_MISSING_MESSAGE;
  if (response.status === 403) return "You do not have access to this document.";
  return `Unable to load document (${response.status}).`;
}

/**
 * Fetch a document URL (Bearer for API streams) and return a browser object URL.
 * Callers must not revoke shared cached URLs.
 */
export async function resolveDocumentObjectUrl(url, { getToken } = {}) {
  if (!url) {
    throw new Error("Document file is not available.");
  }

  if (!isApiDocumentUrl(url)) {
    return { src: url, cached: false };
  }

  if (blobUrlCache.has(url)) {
    return { src: await blobUrlCache.get(url), cached: true };
  }

  const pending = (async () => {
    const token = typeof getToken === "function" ? getToken() : null;
    if (!token) {
      throw new Error("Authentication required to load document.");
    }
    let response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      try {
        response = await fetch(url, {
          headers: {
            Accept: "application/pdf",
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("Document does not exist.");
      }
      throw new Error(
        "Unable to load document. The server appears to be unavailable. Please try again."
      );
    }
    if (!response.ok) {
      throw new Error(await messageFromDocumentResponse(response));
    }
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  })();

  blobUrlCache.set(url, pending);
  try {
    const src = await pending;
    return { src, cached: true };
  } catch (error) {
    blobUrlCache.delete(url);
    throw error;
  }
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
