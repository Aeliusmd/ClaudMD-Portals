/** Drop a trailing MM/DD/YY that some report titles include. */
export function stripTrailingCaptionDate(name) {
  return String(name || "")
    .replace(/\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/, "")
    .trim();
}

export function documentDisplayName(doc) {
  if (!doc) return "Document";
  const raw =
    doc.title ||
    doc.name ||
    doc.reportTitle ||
    doc.documentType ||
    "Document";
  return stripTrailingCaptionDate(raw) || "Document";
}
