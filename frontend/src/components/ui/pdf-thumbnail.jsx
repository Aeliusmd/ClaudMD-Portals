"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
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
      response = await fetch(thumbUrl, {
        headers: {
          Accept: "image/png",
          Authorization: `Bearer ${token}`,
        },
      });
    } catch {
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
 */
export function PdfThumbnail({ url, badge, title, onOpen, className }) {
  const [src, setSrc] = useState(null);
  const [status, setStatus] = useState("loading");

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

      setStatus("loading");
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
        "group relative flex aspect-[17/22] w-full items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm",
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

      {status !== "ready" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white text-foreground-500">
          <FileText className="h-6 w-6" />
          <span className="text-[10px] font-semibold tracking-wide">
            {status === "loading" ? "Loading…" : badge || "PDF"}
          </span>
        </div>
      ) : badge ? (
        <span className="pointer-events-none absolute top-2 left-2 z-10 rounded-md bg-foreground-900/75 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
          {badge}
        </span>
      ) : null}

      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${title}`}
        className="absolute inset-0 z-20 h-full w-full cursor-pointer rounded-xl ring-inset transition group-hover:ring-2 group-hover:ring-primary-400/60"
      />
    </div>
  );
}
