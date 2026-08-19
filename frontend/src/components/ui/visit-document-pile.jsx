"use client";

import { useEffect, useMemo, useState } from "react";
import { PdfThumbnail } from "@/components/ui/pdf-thumbnail";
import { DocumentNameText } from "@/components/ui/document-name-text";
import { cn } from "@/lib/utils";

/** Back sheets peek from the top-right. */
const PILE_OFFSET_PX = 10;
/** Bottom of each page — datetime is printed on the page, not a separate card. */
const PEEK_HEIGHT_PX = 28;

/**
 * Version pile — only for docs with 2+ versions.
 *
 * Each version is one continuous page. Datetime sits on that page’s bottom.
 * Behind pages are taller so their bottom (and datetime) peeks out below.
 */
export function VisitDocumentPile({
  layers,
  tileLabel,
  reportName,
  onOpenLayer,
  className,
  hideCaption = false,
}) {
  const latestIndex = Math.max(0, layers.length - 1);
  const [activeIndex, setActiveIndex] = useState(latestIndex);

  useEffect(() => {
    setActiveIndex(latestIndex);
  }, [layers, latestIndex]);

  const sortedLayers = useMemo(
    () =>
      layers
        .map((layer, index) => ({ layer, index }))
        .sort((a, b) => {
          const leftV =
            Number(String(a.layer.versionTag || "").replace(/\D/g, "")) || 0;
          const rightV =
            Number(String(b.layer.versionTag || "").replace(/\D/g, "")) || 0;
          if (leftV !== rightV) return leftV - rightV;
          return (
            new Date(a.layer.publishedAt || 0).getTime() -
            new Date(b.layer.publishedAt || 0).getTime()
          );
        }),
    [layers]
  );

  const pileDepth = Math.max(0, sortedLayers.length - 1);
  const activePos = sortedLayers.findIndex((item) => item.index === activeIndex);
  const frontLayer = layers[activeIndex];

  /**
   * How far below the front page each behind sheet peeks.
   * Newest-behind first (V5 under V6), oldest furthest down (V1).
   */
  const peekByIndex = useMemo(() => {
    const map = new Map();
    let slot = 1;
    for (let i = sortedLayers.length - 1; i >= 0; i -= 1) {
      const index = sortedLayers[i].index;
      if (index === activeIndex) continue;
      map.set(index, slot * PEEK_HEIGHT_PX);
      slot += 1;
    }
    return map;
  }, [sortedLayers, activeIndex]);

  function versionLabel(layer) {
    return layer.label || layer.versionTag || "Previous version";
  }

  function selectVersion(index, event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (index === activeIndex) return;
    setActiveIndex(index);
  }

  return (
    <div className={cn("min-w-0", className)}>
      <div
        className="relative w-full"
        style={{
          paddingTop: pileDepth * PILE_OFFSET_PX,
          paddingRight: pileDepth * PILE_OFFSET_PX,
          paddingBottom: pileDepth * PEEK_HEIGHT_PX,
        }}
      >
        <div className="relative aspect-[17/22] w-full">
          {sortedLayers.map(({ layer, index }, pos) => {
            const isActive = index === activeIndex;
            const isLatest = index === latestIndex;
            const depth = isActive ? 0 : Math.max(1, Math.abs(activePos - pos));
            const offset = depth * PILE_OFFSET_PX;
            const peek = isActive ? 0 : (peekByIndex.get(index) ?? PEEK_HEIGHT_PX);

            return (
              <div
                key={`sheet-${layer.id}-${layer.versionTag || layer.path || index}`}
                className={cn(
                  "absolute overflow-hidden rounded-sm border border-[#bdbdbd] bg-white",
                  isActive ? "shadow-md" : "shadow-sm"
                )}
                style={{
                  top: -offset,
                  right: -offset,
                  left: offset,
                  bottom: -peek,
                  zIndex: isActive ? 40 : pos + 1,
                }}
              >
                {isActive && layer.url ? (
                  <div className="absolute inset-0" style={{ bottom: PEEK_HEIGHT_PX }}>
                    <PdfThumbnail
                      url={layer.url}
                      title={reportName || "Document"}
                      onOpen={() =>
                        onOpenLayer(frontLayer, activeIndex !== latestIndex)
                      }
                      className="h-full min-h-full w-full rounded-none shadow-none"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    className="absolute inset-0 cursor-pointer bg-white"
                    style={{ bottom: PEEK_HEIGHT_PX }}
                    onClick={(event) => selectVersion(index, event)}
                    aria-label={`Show ${versionLabel(layer)}`}
                  />
                )}

                {/* Datetime on this page’s bottom — not a separate card */}
                <button
                  type="button"
                  onClick={(event) => selectVersion(index, event)}
                  aria-label={
                    isLatest
                      ? `Latest version ${versionLabel(layer)}`
                      : `Show version ${versionLabel(layer)}`
                  }
                  className={cn(
                    "absolute inset-x-0 bottom-0 z-50 flex h-7 cursor-pointer items-center justify-center bg-transparent px-2 text-[12px] font-bold tracking-tight tabular-nums sm:text-[13px]",
                    isLatest ? "text-sky-600" : "text-black"
                  )}
                >
                  {versionLabel(layer)}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {hideCaption ? null : (
        <div className="mt-2 text-center">
          <button
            type="button"
            onClick={(event) => selectVersion(latestIndex, event)}
            className={cn(
              "mx-auto block max-w-full cursor-pointer text-sm font-semibold sm:text-base",
              activeIndex === latestIndex
                ? "text-white"
                : "text-white/45 hover:text-white/70"
            )}
          >
            <DocumentNameText name={tileLabel} title={reportName} />
          </button>
        </div>
      )}
    </div>
  );
}
