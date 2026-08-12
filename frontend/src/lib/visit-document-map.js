import {
  formatDateMMDDYY,
  formatDateTimeCompactMMDDYY,
  formatDateTimeMMDDYY,
} from "@/lib/dates";
import { documentDisplayName } from "@/lib/document-labels";

export function mapPreviousVisitVersions(previousVersions = [], buildFileUrl) {
  return (previousVersions || [])
    .map((version) => {
      const id = version?.id;
      if (id == null) return null;
      const url = typeof buildFileUrl === "function" ? buildFileUrl(id) : null;
      if (!url) return null;
      return {
        id: String(id),
        publishedAt: version.published_at ?? version.publishedAt ?? null,
        versionTag: version.version_tag ?? version.versionTag ?? null,
        path: version.path ?? null,
        url,
      };
    })
    .filter(Boolean);
}

export function formatVisitVersionStamp(value) {
  return formatDateTimeCompactMMDDYY(value);
}

function versionLayerKey(layer) {
  const path = (layer?.path || "").trim().toLowerCase();
  if (path) return `path:${path}`;
  const tag = (layer?.versionTag || "").trim().toLowerCase();
  if (tag) return `tag:${tag}`;
  return `id:${String(layer?.id || "")}`;
}

/** Real report name from API/DB — never a hardcoded label. */
export function visitDocumentReportName(doc) {
  return (
    documentDisplayName(doc).trim() ||
    String(doc?.reportName || doc?.documentType || doc?.name || "").trim() ||
    "Document"
  );
}

function layerStamp(layer, doc) {
  const fromPublish = formatVisitVersionStamp(layer.publishedAt);
  if (fromPublish) return fromPublish;
  return layer.versionTag || "";
}

/**
 * All publish versions for a visit report — oldest → newest (highest V last).
 * Uses previousVersions + current from the API (DocterPublishes V tags / Path).
 */
export function buildVisitVersionLayers(doc) {
  const raw = [];

  for (const previous of doc?.previousVersions || []) {
    if (!previous?.url && previous?.id == null) continue;
    raw.push({
      id: previous.id,
      url: previous.url || null,
      path: previous.path ?? null,
      publishedAt: previous.publishedAt ?? null,
      versionTag: previous.versionTag ?? null,
      isCurrent: false,
    });
  }

  if (doc?.url || doc?.id != null) {
    raw.push({
      id: doc.id || doc.documentId,
      url: doc.url || null,
      path: doc.path ?? null,
      publishedAt: doc.publishedAt ?? null,
      versionTag: doc.versionTag ?? null,
      isCurrent: true,
    });
  }

  const deduped = new Map();
  for (const layer of raw) {
    if (!layer.url && layer.id == null) continue;
    const key = versionLayerKey(layer);
    const existing = deduped.get(key);
    if (
      !existing ||
      new Date(layer.publishedAt || 0).getTime() >
        new Date(existing.publishedAt || 0).getTime()
    ) {
      deduped.set(key, {
        ...layer,
        label: layerStamp(layer, doc),
      });
    }
  }

  return Array.from(deduped.values()).sort((left, right) => {
    const leftV = Number(String(left.versionTag || "").replace(/\D/g, "")) || 0;
    const rightV = Number(String(right.versionTag || "").replace(/\D/g, "")) || 0;
    if (leftV !== rightV) return leftV - rightV;
    return (
      new Date(left.publishedAt || 0).getTime() -
      new Date(right.publishedAt || 0).getTime()
    );
  });
}

/** Every version layer for the pile (no artificial cap). */
export function visibleVisitPileLayers(doc) {
  return buildVisitVersionLayers(doc);
}

/** @deprecated use buildVisitVersionLayers */
export function buildVisitVersionStamps(doc) {
  return buildVisitVersionLayers(doc)
    .slice()
    .reverse()
    .map((layer) => ({
      ...layer,
      isCurrent: layer.isCurrent === true,
    }));
}

/**
 * Visit doc caption under the pile: "{report name} MM/DD/YY"
 * Uses DocterPublishes report name from the API (lowercase for gallery style).
 */
export function visitDocumentTileLabel(doc) {
  const base = visitDocumentReportName(doc);
  const date = formatDateMMDDYY(
    doc?.publishedAt || doc?.visitDate || doc?.reportDate || doc?.date
  );
  const name = base.toLowerCase();
  return date ? `${name} ${date}` : name;
}

export function formatPreviousVersionSummary(previousVersions = []) {
  if (!previousVersions?.length) return null;
  const latest = previousVersions[0];
  const when = formatDateTimeMMDDYY(latest.publishedAt);
  if (!when) return "Previous version available";
  if (previousVersions.length === 1) {
    return `Previous version: ${when}`;
  }
  return `Previous versions available · latest ${when}`;
}
