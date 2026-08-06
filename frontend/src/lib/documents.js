export const SAMPLE_DOCUMENT_URL = "/sample.pdf";

export function openDocumentInNewTab(url = SAMPLE_DOCUMENT_URL) {
  window.open(url, "_blank", "noopener,noreferrer");
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
