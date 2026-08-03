"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function PdfViewerOverlay({ url, title = "sample", onClose }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!url) return undefined;

    function handleEscape(event) {
      if (event.key === "Escape") onClose();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [url, onClose]);

  if (!mounted || !url) return null;

  const src = url.includes("#")
    ? url
    : `${url}#toolbar=1&navpanes=1&scrollbar=1&view=FitH`;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-[#323639]"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} PDF preview`}
    >
      <button
        type="button"
        aria-label="Close PDF preview"
        title="Close"
        onClick={onClose}
        className="absolute top-3 right-3 z-10 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-black/45 text-white transition hover:bg-black/65"
      >
        <X className="h-5 w-5" />
      </button>
      <iframe
        id="document-preview-frame"
        title={title}
        src={src}
        className="h-full w-full flex-1 border-0 bg-[#323639]"
      />
    </div>,
    document.body
  );
}
