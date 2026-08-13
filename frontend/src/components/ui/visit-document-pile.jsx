"use client";

import { useEffect, useMemo, useState } from "react";
import { PdfThumbnail } from "@/components/ui/pdf-thumbnail";
import { DocumentNameText } from "@/components/ui/document-name-text";
import { cn } from "@/lib/utils";

/** Back sheets peek from the top-right. */
const PILE_OFFSET_PX = 10;
/** Datetime on the bottom of each page (same white sheet — not a separate box). */
const STRIP_HEIGHT_PX = 28;

/**
 * Version pile — only for docs with 2+ versions.
 *
 * - Latest (e.g. V2) starts in front
 * - Click any version datetime → that sheet comes to the front
 * - Latest datetime is colored so it stays obvious after switching
 */
export function VisitDocumentPile({
  layers,
  badge,
  tileLabel,
  reportName,
  onOpenLayer,
  className,
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

  const versionCount = sortedLayers.length;
  const pileDepth = Math.max(0, versionCount - 1);
  const activePos = sortedLayers.findIndex((item) => item.index === activeIndex);
  const frontLayer = layers[activeIndex];

  /**
   * Front version’s datetime sits directly under the page;
   * remaining versions peek below — always all visible / clickable.
   */
  const stampOrder = useMemo(() => {
    if (activePos < 0) return sortedLayers;
    return [
      sortedLayers[activePos],
      ...sortedLayers.filter((_, pos) => pos !== activePos),
    ];
  }, [sortedLayers, activePos]);

  function versionLabel(layer) {
    return layer.label || layer.versionTag || "Previous version";
  }

  function selectVersion(index, event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (index === activeIndex) return;
    setActiveIndex(index);
  }

  function sheetOffset(pos, isActive) {
    if (isActive) return 0;
    return Math.max(1, Math.abs(activePos - pos)) * PILE_OFFSET_PX;
  }

  return (
    <div className={cn("min-w-0", className)}>
      <div
        className="relative w-full"
        style={{
          paddingTop: pileDepth * PILE_OFFSET_PX,
          paddingRight: pileDepth * PILE_OFFSET_PX,
          paddingBottom: versionCount * STRIP_HEIGHT_PX,
        }}
      >
        <div className="relative aspect-[17/22] w-full">
          {sortedLayers.map(({ layer, index }, pos) => {
            const isActive = index === activeIndex;
            const offset = sheetOffset(pos, isActive);

            return (
              <div
                key={`body-${layer.id}-${layer.versionTag || layer.path || index}`}
                className={cn(
                  "absolute overflow-hidden rounded-t-sm border border-b-0 border-[#bdbdbd] bg-white",
                  isActive ? "shadow-md" : "shadow-sm"
                )}
                style={{
                  top: -offset,
                  right: -offset,
                  left: offset,
                  bottom: 0,
                  zIndex: isActive ? 40 : pos + 1,
                }}
              >
                {isActive && layer.url ? (
                  <PdfThumbnail
                    url={layer.url}
                    badge={badge}
                    title={reportName || "Document"}
                    onOpen={() =>
                      onOpenLayer(frontLayer, activeIndex !== latestIndex)
                    }
                    className="h-full min-h-full w-full rounded-none shadow-none"
                  />
                ) : (
                  <button
                    type="button"
                    className="absolute inset-0 cursor-pointer bg-white"
                    onClick={(event) => selectVersion(index, event)}
                    aria-label={`Show ${versionLabel(layer)}`}
                  />
                )}
              </div>
            );
          })}

          {/*
            Datetimes sit above page bodies so every version date is clickable.
            Latest version uses a distinct color even when it is not in front.
          */}
          {stampOrder.map(({ layer, index }, stampPos) => {
            const isActive = index === activeIndex;
            const isLatest = index === latestIndex;
            const sortPos = sortedLayers.findIndex((item) => item.index === index);
            const offset = sheetOffset(sortPos, isActive);
            const isLast = stampPos === stampOrder.length - 1;

            return (
              <button
                key={`stamp-${layer.id}-${layer.versionTag || layer.path || index}`}
                type="button"
                onClick={(event) => selectVersion(index, event)}
                aria-label={
                  isLatest
                    ? `Latest version ${versionLabel(layer)}`
                    : `Show version ${versionLabel(layer)}`
                }
                className={cn(
                  "absolute flex cursor-pointer items-center justify-center px-2 text-[12px] font-bold tracking-tight tabular-nums sm:text-[13px]",
                  isLatest
                    ? "bg-sky-100 text-sky-800"
                    : "bg-white text-black"
                )}
                style={{
                  top: `calc(100% + ${stampPos * STRIP_HEIGHT_PX}px)`,
                  left: offset,
                  right: -offset,
                  height: STRIP_HEIGHT_PX,
                  zIndex: 80 + stampPos,
                  borderLeft: "1px solid #bdbdbd",
                  borderRight: "1px solid #bdbdbd",
                  borderBottom: isLast ? "1px solid #bdbdbd" : "0",
                  borderTop: stampPos === 0 ? "1px solid #e5e5e5" : "0",
                  borderBottomLeftRadius: isLast ? "2px" : 0,
                  borderBottomRightRadius: isLast ? "2px" : 0,
                }}
              >
                {versionLabel(layer)}
              </button>
            );
          })}
        </div>
      </div>

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
    </div>
  );
}
