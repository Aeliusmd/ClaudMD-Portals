"use client";

import { PdfThumbnail } from "@/components/ui/pdf-thumbnail";
import { DocumentNameText } from "@/components/ui/document-name-text";
import { VisitDocumentPile } from "@/components/ui/visit-document-pile";
import { documentDisplayName, shortDocumentBadge } from "@/lib/document-labels";
import {
  visitDocumentReportName,
  visitDocumentTileLabel,
  visibleVisitPileLayers,
} from "@/lib/visit-document-map";
import { cn } from "@/lib/utils";

/** Two document thumbnails per row with larger, legible previews. */
export function DocumentThumbGrid({ children, className }) {
  return (
    <div className={cn("grid grid-cols-2 gap-4 sm:gap-5", className)}>
      {children}
    </div>
  );
}

export function DocumentThumbTile({
  doc,
  onPreview,
  className,
}) {
  const badge = shortDocumentBadge(doc);
  const url = doc?.url;
  if (!url) return null;

  const name = documentDisplayName(doc);
  const reportName = visitDocumentReportName(doc);
  const tileLabel = visitDocumentTileLabel(doc);
  const pileLayers = visibleVisitPileLayers(doc);
  const hasVersionPile = pileLayers.length > 1;

  function openLayer(layer, isPreviousVersion) {
    if (!onPreview) return;
    const openUrl = layer?.url || doc.url;
    if (!openUrl) return;
    onPreview({
      ...doc,
      ...layer,
      id: layer?.id || doc.id,
      documentId: layer?.id || doc.documentId || doc.id,
      url: openUrl,
      path: layer?.path || doc.path,
      title: name,
      previewBadge: badge,
      isPreviousVersion,
    });
  }

  return (
    <div className={cn("min-w-0", className)}>
      {hasVersionPile ? (
        <VisitDocumentPile
          layers={pileLayers}
          badge={badge}
          tileLabel={tileLabel}
          reportName={reportName}
          onOpenLayer={openLayer}
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-black/5">
            <PdfThumbnail
              url={url}
              badge={badge}
              title={name}
              onOpen={() => openLayer(pileLayers[0] || { url }, false)}
              className="rounded-2xl shadow-none"
            />
          </div>
          <div className="mt-3 text-center">
            <DocumentNameText
              name={tileLabel}
              title={reportName}
              className="text-sm font-semibold text-white sm:text-base"
            />
          </div>
        </>
      )}
    </div>
  );
}

export function DocumentThumbGridSkeleton({ count = 2 }) {
  return (
    <DocumentThumbGrid>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="min-w-0">
          <div className="aspect-[17/22] w-full animate-pulse rounded-2xl bg-white/20" />
          <div className="mx-auto mt-3 h-5 w-full max-w-[10rem] animate-pulse rounded bg-white/15" />
        </div>
      ))}
    </DocumentThumbGrid>
  );
}
