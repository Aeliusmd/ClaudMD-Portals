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
 * Front = latest (V2) initially. Each version is one continuous white page with
 * its datetime on that page’s bottom. Sheets are offset so every datetime stays
 * visible; click any datetime to bring that version forward.
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

  /** Peek slots under the front page — one per non-front version (bottom → up). */
  const peekBottomByIndex = useMemo(() => {
    const map = new Map();
    let slot = 0;
    for (const { index } of sortedLayers) {
      if (index === activeIndex) continue;
      map.set(index, slot * STRIP_HEIGHT_PX);
      slot += 1;
    }
    return map;
  }, [sortedLayers, activeIndex]);

  function versionLabel(layer) {
    return layer.label || layer.versionTag || "Previous version";
  }

  function selectVersion(index) {
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
          paddingBottom: pileDepth * STRIP_HEIGHT_PX,
        }}
      >
        <div className="relative aspect-[17/22] w-full">
          {sortedLayers.map(({ layer, index }, pos) => {
            const isActive = index === activeIndex;
            const depth = isActive ? 0 : Math.max(1, Math.abs(activePos - pos));
            const offset = depth * PILE_OFFSET_PX;

            /*
              Front page sits above the peek area; its datetime is on its own bottom.
              Behind pages sit lower so their bottom datetimes peek out — still one
              continuous sheet each (no extra boxes).
            */
            const bottom = isActive
              ? pileDepth * STRIP_HEIGHT_PX
              : (peekBottomByIndex.get(index) ?? 0);

            return (
              <div
                key={`sheet-${layer.id}-${layer.versionTag || layer.path || index}`}
                className={cn(
                  "absolute flex flex-col overflow-hidden rounded-sm border border-[#bdbdbd] bg-white",
                  isActive ? "shadow-md" : "shadow-sm"
                )}
                style={{
                  top: -offset,
                  right: -offset,
                  left: offset,
                  bottom,
                  zIndex: isActive ? 50 : pos + 1,
                }}
              >
                <div className="relative min-h-0 flex-1 overflow-hidden">
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
                      onClick={() => selectVersion(index)}
                      aria-label={`Show ${versionLabel(layer)}`}
                    />
                  )}
                </div>

                {/* Same page — datetime on the bottom edge (not a separate box) */}
                <button
                  type="button"
                  onClick={() => selectVersion(index)}
                  className="flex h-7 shrink-0 cursor-pointer items-center justify-center bg-white px-2 text-[12px] font-bold tracking-tight text-black tabular-nums sm:text-[13px]"
                >
                  {versionLabel(layer)}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-2 text-center">
        <button
          type="button"
          onClick={() => selectVersion(latestIndex)}
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
