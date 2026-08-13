/**
 * Collapse duplicate shares of the same file, then group by patient / visit / report
 * so the outsider gallery matches visit piles on other portals.
 */

function shareTime(item) {
  return Date.parse(item?.sharedAt || "") || 0;
}

function uniqueSharesByDocument(items) {
  const byDocument = new Map();
  for (const item of items || []) {
    const key = String(item.documentId ?? item.sharedId);
    const existing = byDocument.get(key);
    if (!existing || shareTime(item) >= shareTime(existing)) {
      byDocument.set(key, item);
    }
  }
  return Array.from(byDocument.values());
}

function tileKey(item) {
  const visit = item.checkInId != null ? String(item.checkInId) : "none";
  const report =
    item.reportId != null
      ? String(item.reportId)
      : String(item.documentType || item.reportTitle || item.sharedId);
  return `${visit}:${report}`;
}

function toVisitDocument(versions) {
  const sorted = [...versions].sort((left, right) => shareTime(left) - shareTime(right));
  const latest = sorted[sorted.length - 1];
  const previousVersions = sorted.slice(0, -1).map((item) => ({
    id: String(item.documentId),
    documentId: String(item.documentId),
    url: item.document?.url || null,
    publishedAt: item.sharedAt || item.visitDate || null,
    sharedId: item.sharedId,
    isViewed: Boolean(item.isViewed),
  }));

  return {
    id: String(latest.documentId),
    documentId: String(latest.documentId),
    sharedId: latest.sharedId,
    title: latest.document?.title || latest.reportTitle || latest.documentType,
    documentType: latest.documentType,
    reportTitle: latest.reportTitle,
    visitDate: latest.visitDate,
    publishedAt:
      latest.publishedAt ||
      latest.document?.publishedAt ||
      latest.visitDate ||
      null,
    sharedAt: latest.sharedAt || null,
    url: latest.document?.url || null,
    isViewed: versions.every((item) => item.isViewed),
    previousVersions,
  };
}

function patientKeyOf(item) {
  return String(item.employee?.patientId ?? item.employee?.name ?? "patient");
}

export function groupOutsiderSharedDocuments(items) {
  const unique = uniqueSharesByDocument(items);
  const patients = new Map();

  for (const item of unique) {
    const patientKey = patientKeyOf(item);
    if (!patients.has(patientKey)) {
      patients.set(patientKey, {
        patientKey,
        name: item.employee?.name || "Patient",
        tiles: new Map(),
      });
    }
    const group = patients.get(patientKey);
    const key = tileKey(item);
    if (!group.tiles.has(key)) group.tiles.set(key, []);
    group.tiles.get(key).push(item);
  }

  return Array.from(patients.values())
    .map((patient) => {
      const documents = Array.from(patient.tiles.values()).map(toVisitDocument);
      const uniqueItems = Array.from(patient.tiles.values()).flat();
      const lastSharedAt = uniqueItems.reduce((latest, item) => {
        const time = shareTime(item);
        return time > latest ? time : latest;
      }, 0);
      const lastSharedItem = uniqueItems.find(
        (item) => shareTime(item) === lastSharedAt
      );
      const unreadDocuments = documents.filter((doc) => !doc.isViewed);
      const viewedDocuments = documents.filter((doc) => doc.isViewed);
      return {
        patientKey: patient.patientKey,
        name: patient.name,
        documents,
        unreadDocuments,
        viewedDocuments,
        unreadCount: unreadDocuments.length,
        documentCount: documents.length,
        lastSharedAt: lastSharedItem?.sharedAt || null,
        hasUnread: unreadDocuments.length > 0,
      };
    })
    .sort(
      (left, right) =>
        (Date.parse(right.lastSharedAt || "") || 0) -
        (Date.parse(left.lastSharedAt || "") || 0)
    );
}
