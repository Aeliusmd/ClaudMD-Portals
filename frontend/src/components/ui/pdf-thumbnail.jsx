"use client";

import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * pdf.js is heavy and browser-only, so it is imported on first use rather than
 * bundled into the page. Its worker is served from `public/` (kept in sync by
 * the `postinstall` script) — the worker build must match the API version.
 */
let pdfjsPromise = null;

function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url
      ).toString();
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

/** Several thumbnails usually point at the same file — parse it once. */
const documentCache = new Map();

function loadDocument(pdfjs, url) {
  if (!documentCache.has(url)) {
    // v6 dropped the bare-string form of getDocument.
    documentCache.set(url, pdfjs.getDocument({ url }).promise);
  }
  return documentCache.get(url);
}

export function PdfThumbnail({ url, badge, title, onOpen, className }) {
  const boxRef = useRef(null);
  const canvasRef = useRef(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    let renderTask = null;

    async function renderFirstPage() {
      try {
        const pdfjs = await loadPdfjs();
        const pdf = await loadDocument(pdfjs, url);
        const page = await pdf.getPage(1);

        const box = boxRef.current;
        const canvas = canvasRef.current;
        if (cancelled || !box || !canvas) return;

        // Letterbox the page inside the thumbnail box, then draw at device
        // resolution so the preview stays sharp on retina screens.
        const base = page.getViewport({ scale: 1 });
        const fit = Math.min(
          box.clientWidth / base.width,
          box.clientHeight / base.height
        );
        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: fit * dpr });

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(base.width * fit)}px`;
        canvas.style.height = `${Math.floor(base.height * fit)}px`;

        renderTask = page.render({ canvas, viewport });
        await renderTask.promise;

        if (!cancelled) setStatus("ready");
      } catch (error) {
        if (!cancelled && error?.name !== "RenderingCancelledException") {
          setStatus("error");
        }
      }
    }

    renderFirstPage();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [url]);

  return (
    <div
      ref={boxRef}
      className={cn(
        "group relative flex aspect-[17/22] w-full items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm",
        className
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={cn(
          "block transition-opacity",
          status === "ready" ? "opacity-100" : "opacity-0"
        )}
      />

      {status !== "ready" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-foreground-500">
          <FileText className="h-6 w-6" />
          {status === "error" ? (
            <span className="text-[10px] font-semibold tracking-wide">
              {badge || "PDF"}
            </span>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${title}`}
        className="absolute inset-0 h-full w-full cursor-pointer rounded-xl ring-inset transition group-hover:ring-2 group-hover:ring-primary-400/60"
      />
    </div>
  );
}
