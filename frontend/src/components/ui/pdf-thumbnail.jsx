"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { getAccessToken } from "@/lib/auth-session";
import {
  isApiDocumentUrl,
  visitDocumentThumbnailUrlFromFileUrl,
} from "@/lib/documents";
import { cn } from "@/lib/utils";

/** Shared thumbnail blob URLs so remounts do not cancel in-flight fetches. */
const thumbCache = new Map();

function loadThumbnailObjectUrl(thumbUrl) {
  if (thumbCache.has(thumbUrl)) {
    return thumbCache.get(thumbUrl);
  }

  const pending = (async () => {
    const token = getAccessToken();
    if (!token) {
      throw new Error("Authentication required to load document.");
    }
    let response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);
      try {
        response = await fetch(thumbUrl, {
          headers: {
            Accept: "image/png",
            Authorization: `Bearer ${token}`,
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error("Preview timed out. Try again.");
      }
      throw new Error(
        "Unable to load preview. The server appears to be unavailable."
      );
    }
    if (!response.ok) {
      throw new Error(`Unable to load preview (${response.status}).`);
    }
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  })();

  thumbCache.set(thumbUrl, pending);
  pending.catch(() => {
    thumbCache.delete(thumbUrl);
  });
  return pending;
}

/**
 * Shows page-1 content as a static image (no scrollbar).
 * Click opens the full PDF preview modal.
 * When content is unavailable the white page + badge still render (pile UI stays visible).
 */
export function PdfThumbnail({
  url,
  badge,
  title,
  onOpen,
  onLoadStatusChange,
  className,
}) {
  const [src, setSrc] = useState(null);
  const [status, setStatus] = useState("loading");
  const onLoadStatusChangeRef = useRef(onLoadStatusChange);

  useEffect(() => {
    onLoadStatusChangeRef.current = onLoadStatusChange;
  }, [onLoadStatusChange]);

  useEffect(() => {
    onLoadStatusChangeRef.current?.(status);
  }, [status]);

  useEffect(() => {
    let alive = true;

    async function load() {
      const thumbUrl = isApiDocumentUrl(url)
        ? visitDocumentThumbnailUrlFromFileUrl(url)
        : null;

      if (!thumbUrl) {
        setStatus("error");
        setSrc(null);
        return;
      }

      // Reuse cached preview immediately — no long loading flash on version switch.
      if (thumbCache.has(thumbUrl)) {
        setStatus("loading");
        try {
          const objectUrl = await thumbCache.get(thumbUrl);
          if (!alive) return;
          setSrc(objectUrl);
          setStatus("ready");
        } catch {
          if (!alive) return;
          setSrc(null);
          setStatus("error");
        }
        return;
      }

      setStatus("loading");
      setSrc(null);
      try {
        const objectUrl = await loadThumbnailObjectUrl(thumbUrl);
        if (!alive) return;
        setSrc(objectUrl);
        setStatus("ready");
      } catch {
        if (!alive) return;
        setSrc(null);
        setStatus("error");
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [url]);

  return (
    <div
      className={cn(
        "group relative flex w-full items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm",
        // Default tile ratio; callers can override with h-full for stacked piles.
        !className?.includes("h-full") && "aspect-[17/22]",
        className
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="max-h-full max-w-full object-contain"
          draggable={false}
        />
      ) : null}

      {status === "loading" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white text-foreground-500">
          <Loader2 className="h-8 w-8 animate-spin text-primary-400" />
          <span className="text-xs font-semibold tracking-wide">Loading…</span>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white text-foreground-500">
          <FileText className="h-10 w-10" />
          <span className="text-xs font-semibold tracking-wide">
            {badge || "PDF"}
          </span>
        </div>
      ) : null}

      {status === "ready" && badge ? (
        <span className="pointer-events-none absolute top-2.5 left-2.5 z-10 rounded-md bg-foreground-900/75 px-2 py-1 text-xs font-bold tracking-wide text-white">
          {badge}
        </span>
      ) : null}

      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        aria-label={onOpen ? `Open ${title}` : title}
        className={cn(
          "absolute inset-0 z-20 h-full w-full rounded-xl ring-inset transition",
          onOpen
            ? "cursor-pointer group-hover:ring-2 group-hover:ring-primary-400/60"
            : "pointer-events-none cursor-default"
        )}
      />
    </div>
  );
}
