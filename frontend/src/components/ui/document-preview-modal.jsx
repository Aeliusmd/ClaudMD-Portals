"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Download,
  ExternalLink,
  FileText,
  Mail,
  Printer,
  X,
} from "lucide-react";
import { openDocumentInNewTab } from "@/lib/documents";

function actionButtonClassName() {
  return "cursor-pointer rounded-lg p-2 text-[#6b7280] transition hover:bg-cream-deep hover:text-ink sm:p-2.5";
}

export function DocumentPreviewModal({ file, onClose }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!file) return undefined;

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
  }, [file, onClose]);

  if (!mounted || !file) return null;

  const documentId = file.documentId || "N/A";
  const documentDate =
    file.reportDate || file.shareDate || file.visitDate || file.date || "N/A";
  const displayTitle = file.title || "Clinical Document";

  function handleDownload() {
    openDocumentInNewTab(file.url);
  }

  function handlePrint() {
    const frame = document.getElementById("document-preview-frame");
    if (frame?.contentWindow) {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      return;
    }
    window.print();
  }

  function handleEmail() {
    const subject = encodeURIComponent(displayTitle);
    const body = encodeURIComponent(
      `Please review this clinical document.\n\nTitle: ${displayTitle}\nDocument ID: ${documentId}\nDate: ${documentDate}\n`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  function handleOpenExternal() {
    openDocumentInNewTab(file.url);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex h-full w-full flex-col bg-white"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${displayTitle}`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#ece7df] px-3 py-3 sm:gap-4 sm:px-5 sm:py-4">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#e8f1fb] text-primary sm:h-10 sm:w-10">
            <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-sans text-sm font-semibold text-ink sm:text-base">
              {displayTitle}
            </p>
            <p className="mt-0.5 truncate font-sans text-xs tabular-nums text-muted sm:text-sm">
              {documentId}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0 sm:gap-0.5">
          <button
            type="button"
            aria-label="Download document"
            title="Download"
            onClick={handleDownload}
            className={actionButtonClassName()}
          >
            <Download className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
          <button
            type="button"
            aria-label="Print document"
            title="Print"
            onClick={handlePrint}
            className={actionButtonClassName()}
          >
            <Printer className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
          <button
            type="button"
            aria-label="Email document"
            title="Email"
            onClick={handleEmail}
            className={actionButtonClassName()}
          >
            <Mail className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
          <button
            type="button"
            aria-label="Open in new tab"
            title="Open in new tab"
            onClick={handleOpenExternal}
            className={actionButtonClassName()}
          >
            <ExternalLink className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
          <button
            type="button"
            aria-label="Close preview"
            title="Close"
            onClick={onClose}
            className={actionButtonClassName()}
          >
            <X className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-1 border-b border-[#ece7df] bg-[#f7f3ea] px-3 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-5 sm:py-4">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.04em] text-ink uppercase sm:text-sm">
            Clinical Document
          </p>
          <p className="mt-1 text-xs text-[#5b6470] sm:text-sm">
            Document ID:{" "}
            <span className="tabular-nums text-ink">{documentId}</span>
          </p>
        </div>
        <p className="shrink-0 text-xs text-[#5b6470] sm:text-sm">
          Date: <span className="tabular-nums text-ink">{documentDate}</span>
        </p>
      </div>

      <div className="min-h-0 flex-1 bg-[#525659]">
        <iframe
          id="document-preview-frame"
          title={`${displayTitle} preview`}
          src={`${file.url || "/sample.pdf"}#toolbar=1&navpanes=1&scrollbar=1&view=FitH`}
          className="h-full w-full border-0 bg-[#323639]"
        />
      </div>
    </div>,
    document.body
  );
}
