/** Short badge shown on document thumbnails (DFR, PR, etc.). */
export function shortDocumentBadge(doc) {
  if (!doc) return "DOC";
  if (doc.previewBadge) return doc.previewBadge;
  if (doc.previewLabel === "PT report") return "PR";
  if (doc.previewLabel) return doc.previewLabel;
  if (
    doc.badgeLabel === "Work Status" ||
    doc.documentType?.includes("Work Status")
  ) {
    return "WSR";
  }
  if (
    doc.documentType?.includes("Doctor First") ||
    doc.documentType?.includes("Doctor's First")
  ) {
    return "DFR";
  }
  if (doc.documentType?.includes("Physical")) return "PR";
  return "DOC";
}

export function documentDisplayName(doc) {
  if (!doc) return "Document";
  return (
    doc.title ||
    doc.name ||
    doc.reportTitle ||
    doc.documentType ||
    "Document"
  );
}
