"use client";

import {
  Download,
  Mail,
  Printer,
  ZoomIn,
} from "lucide-react";
import { SAMPLE_DOCUMENT_URL, openDocumentInNewTab } from "@/lib/documents";
import { cn } from "@/lib/utils";

function FaxIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="5" y="3" width="14" height="6" rx="1.5" />
      <path d="M7 9v2" />
      <path d="M17 9v2" />
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <path d="M8 15h.01" />
      <path d="M12 15h.01" />
      <path d="M16 15h.01" />
      <path d="M8 18h8" />
    </svg>
  );
}

function DocumentThumb() {
  return (
    <span className="relative block h-[4.25rem] w-[3.35rem] overflow-hidden rounded-[3px] border border-[#9ca3af] bg-[#eef0f3] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.6)]">
      <span className="absolute inset-y-1 right-[3px] w-[3px] rounded-full bg-[#c5cad1]">
        <span className="absolute top-1 left-0 h-4 w-full rounded-full bg-[#6b7280]" />
      </span>
      <span className="absolute inset-x-1.5 top-2 space-y-[3px] pr-2">
        <span className="block h-[3px] rounded-sm bg-[#b8bec7]" />
        <span className="block h-[3px] rounded-sm bg-[#c9ced6]" />
        <span className="block h-[3px] w-4/5 rounded-sm bg-[#c9ced6]" />
        <span className="mt-1 block h-[3px] rounded-sm bg-[#c9ced6]" />
        <span className="block h-[3px] rounded-sm bg-[#c9ced6]" />
        <span className="block h-[3px] w-3/5 rounded-sm bg-[#c9ced6]" />
        <span className="mt-1 block h-[3px] rounded-sm bg-[#c9ced6]" />
        <span className="block h-[3px] w-2/3 rounded-sm bg-[#c9ced6]" />
      </span>
    </span>
  );
}

function ActionButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="cursor-pointer rounded-md p-1.5 text-[#6b7280] transition hover:bg-[#eef2ff] hover:text-ink"
    >
      {children}
    </button>
  );
}

export function VisitDocumentCard({ doc, onPreview }) {
  const file = {
    title: doc.title,
    documentId: doc.documentId || doc.id || "N/A",
    date: doc.date,
    url: doc.url || SAMPLE_DOCUMENT_URL,
    type: doc.type,
  };

  function handlePreview(event) {
    event?.stopPropagation?.();
    onPreview?.(file);
  }

  function handleDownload(event) {
    event.stopPropagation();
    openDocumentInNewTab(file.url);
  }

  function handlePrint(event) {
    event.stopPropagation();
    const printWindow = window.open(file.url, "_blank", "noopener,noreferrer");
    if (printWindow) {
      printWindow.addEventListener("load", () => {
        printWindow.focus();
        printWindow.print();
      });
    }
  }

  function handleEmail(event) {
    event.stopPropagation();
    const subject = encodeURIComponent(file.title);
    const body = encodeURIComponent(
      `Please review this clinical document.\n\nTitle: ${file.title}\nType: ${file.type || "Document"}\nDate: ${file.date || "N/A"}\n`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  function handleFax(event) {
    event.stopPropagation();
    window.alert("Fax sent (demo only).");
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handlePreview}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handlePreview();
        }
      }}
      className={cn(
        "group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-[#e8eaee] bg-white px-3 py-2.5 text-left transition",
        "hover:border-primary/50 hover:shadow-[0_0_0_1px_rgba(29,120,214,0.12)]",
        "focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
      )}
    >
      <span className="relative shrink-0 cursor-pointer">
        <DocumentThumb />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition duration-150 group-hover:opacity-100">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#374151] shadow-[0_2px_10px_rgba(15,23,42,0.22)] ring-1 ring-black/5">
            <ZoomIn className="h-4 w-4" strokeWidth={2.25} />
          </span>
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink transition group-hover:text-primary">
          {doc.title}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full bg-[#e8f1fb] px-2.5 py-0.5 text-[11px] font-semibold text-primary">
            {doc.type}
          </span>
          <span className="text-xs tabular-nums text-muted">{doc.date}</span>
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-0.5">
        <ActionButton label="Download" onClick={handleDownload}>
          <Download className="h-4 w-4" />
        </ActionButton>
        <ActionButton label="Print" onClick={handlePrint}>
          <Printer className="h-4 w-4" />
        </ActionButton>
        <ActionButton label="Email" onClick={handleEmail}>
          <Mail className="h-4 w-4" />
        </ActionButton>
        <ActionButton label="Fax" onClick={handleFax}>
          <FaxIcon className="h-4 w-4" />
        </ActionButton>
      </span>
    </div>
  );
}
