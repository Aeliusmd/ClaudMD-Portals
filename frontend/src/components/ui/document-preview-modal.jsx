"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileText,
  Mail,
  Printer,
  X,
} from "lucide-react";
import { getAccessToken } from "@/lib/auth-session";
import {
  downloadDocumentUrl,
  openDocumentInNewTab,
  resolveDocumentObjectUrl,
  visitDocumentIdFromUrl,
} from "@/lib/documents";
import { formatDateMMDDYY } from "@/lib/dates";
import { DocumentNameText } from "@/components/ui/document-name-text";

function actionButtonClassName() {
  return "cursor-pointer rounded-lg p-2 text-[#6b7280] transition hover:bg-cream-deep hover:text-ink sm:p-2.5";
}

async function resolvePreviewUrl(url) {
  const resolved = await resolveDocumentObjectUrl(url, {
    getToken: getAccessToken,
  });
  return { src: resolved.src, revoke: null };
}

export function DocumentPreviewModal({ file, onClose, backLabel = "Back" }) {
  const [mounted, setMounted] = useState(false);
  const [previewSrc, setPreviewSrc] = useState(null);
  const [loadError, setLoadError] = useState("");

  function handleBack() {
    onClose();
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!file?.url) return undefined;

    let cancelled = false;
    let revoke = null;

    async function load() {
      setLoadError("");
      setPreviewSrc(null);
      try {
        const resolved = await resolvePreviewUrl(file.url);
        if (cancelled) {
          resolved.revoke?.();
          return;
        }
        revoke = resolved.revoke;
        setPreviewSrc(resolved.src);
      } catch (error) {
        if (!cancelled) {
          setLoadError(error?.message || "Unable to load document.");
          setPreviewSrc(null);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
      revoke?.();
    };
  }, [file?.url, file?.documentId, file?.id]);

  useEffect(() => {
    if (!file) return undefined;

    function handleEscape(event) {
      if (event.key === "Escape") handleBack();
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

  // Prefer the version id actually being loaded (from props or from the file URL).
  const documentId =
    file.documentId ||
    file.id ||
    visitDocumentIdFromUrl(file.url) ||
    "N/A";
  const documentDate = formatDateMMDDYY(
    file.publishedAt ||
      file.reportDate ||
      file.shareDate ||
      file.visitDate ||
      file.date
  ) || "N/A";
  const displayTitle = file.title || "Clinical Document";

  function handleDownload() {
    if (!previewSrc) return;
    const base = String(displayTitle || "document")
      .replace(/[<>:"/\\|?*]+/g, "_")
      .trim();
    downloadDocumentUrl(previewSrc, `${base || "document"}.pdf`);
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
    if (!previewSrc) return;
    openDocumentInNewTab(previewSrc);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex h-full w-full flex-col bg-white"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${displayTitle}`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#ece7df] px-3 py-3 sm:gap-4 sm:px-5 sm:py-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-primary transition hover:bg-[#e8f1fb] sm:gap-2 sm:px-3"
          >
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            <span>{backLabel}</span>
          </button>

          <span className="hidden h-8 w-px shrink-0 bg-[#ece7df] sm:block" aria-hidden="true" />

          <span className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#e8f1fb] text-primary sm:h-10 sm:w-10">
              <FileText className="h-4 w-4 sm:h-5 sm:w-5" />
            </span>
            <div className="min-w-0">
              <DocumentNameText
                name={displayTitle}
                className="font-sans text-sm font-semibold text-ink sm:text-base"
              />
              <p className="mt-0.5 truncate font-sans text-xs tabular-nums text-muted sm:text-sm">
                {documentId}
              </p>
            </div>
          </span>
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
            onClick={handleBack}
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
          {loadError ? (
            <p className="mt-1 text-xs text-accent-600">{loadError}</p>
          ) : null}
        </div>
        <p className="shrink-0 text-xs text-[#5b6470] sm:text-sm">
          Date: <span className="tabular-nums text-ink">{documentDate}</span>
        </p>
      </div>

      <div className="min-h-0 flex-1 bg-[#525659]">
        {previewSrc ? (
          <iframe
            id="document-preview-frame"
            title={`${displayTitle} preview`}
            src={`${previewSrc}#toolbar=1&navpanes=1&scrollbar=1&view=FitH`}
            className="h-full w-full border-0 bg-[#323639]"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            {loadError ? (
              <>
                <FileText className="h-12 w-12 text-white/40" />
                <p className="text-base font-semibold text-white">
                  {loadError}
                </p>
                {documentId && documentId !== "N/A" ? (
                  <p className="text-sm text-white/70">
                    Document ID:{" "}
                    <span className="tabular-nums text-white">{documentId}</span>
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-white/80">Loading document…</p>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
