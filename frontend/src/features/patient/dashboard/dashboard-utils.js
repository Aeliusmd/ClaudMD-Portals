import { newlySharedDocuments } from "@/data/documents";

const unreadDocumentTitles = new Set(
  newlySharedDocuments
    .filter((document) => document.isNew)
    .map((document) => document.title)
);

/** A visit's report is unread until the patient opens the newly shared document. */
export function unreadReportCount(visit) {
  return (visit.documents || []).filter((document) =>
    unreadDocumentTitles.has(document.title)
  ).length;
}
