"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Download,
  Eye,
  FileText,
  User,
} from "lucide-react";
import { EmployerCategoryFilter } from "@/components/employer/category-filter";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DateRangeInput } from "@/components/ui/date-range-input";
import { DocumentPreviewModal } from "@/components/ui/document-preview-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, paginateItems } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { ReportDetailPanel } from "@/features/employer/shared-documents/report-detail-panel";
import { sharedDocuments } from "@/data/employer";
import { reportBadgeStyles } from "@/lib/report-badge-styles";
import { openDocumentInNewTab } from "@/lib/documents";
import { coerceToDate, daysAgoIso, todayIso } from "@/lib/date-range";
import { cn } from "@/lib/utils";

const SHARED_DOCS_PAGE_SIZE = 15;

export function EmployerSharedDocumentsView() {
  const [category, setCategory] = useState(null);
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState(() => daysAgoIso(30));
  const [toDate, setToDate] = useState(() => todayIso());
  const [selectedId, setSelectedId] = useState(null);
  const [page, setPage] = useState(1);
  const [previewFile, setPreviewFile] = useState(null);

  const newCount = sharedDocuments.filter((doc) => doc.isNew).length;

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return sharedDocuments.filter((doc) => {
      if (category && doc.category !== category) return false;
      if (fromDate && doc.dateValue < fromDate) return false;
      if (toDate && doc.dateValue > toDate) return false;
      if (normalizedQuery) {
        const haystack = [
          doc.employee,
          doc.incidentNumber,
          doc.title,
          doc.documentType,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(normalizedQuery)) return false;
      }
      return true;
    });
  }, [category, fromDate, toDate, query]);

  useEffect(() => {
    setPage(1);
  }, [category, fromDate, toDate, query]);

  useEffect(() => {
    if (selectedId && !rows.some((doc) => doc.id === selectedId)) {
      setSelectedId(null);
    }
  }, [rows, selectedId]);

  const paged = paginateItems(rows, page, SHARED_DOCS_PAGE_SIZE);
  const selected = rows.find((doc) => doc.id === selectedId) || null;

  function handleCategoryChange(nextCategory) {
    setCategory((prev) => (prev === nextCategory ? null : nextCategory));
    setSelectedId(null);
  }

  function openPreview(doc) {
    setPreviewFile({
      title: doc.title,
      documentId: doc.documentId,
      url: doc.url,
    });
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl md:text-4xl">
          Shared Documents
        </h1>
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>
            Shared reports inbox — all clinic-shared reports for your employees
          </span>
          {newCount > 0 ? (
            <Badge className="bg-rose-600 text-white">{newCount} new</Badge>
          ) : null}
        </p>
      </div>

      <SearchInput
        className="mb-4"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by employee name, incident number, or report title..."
        ariaLabel="Search shared documents"
      />

      <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <EmployerCategoryFilter
          value={category}
          onChange={handleCategoryChange}
        />

        <div className="hidden h-8 w-px bg-border sm:block" aria-hidden="true" />

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <DateRangeInput
            id="shared-docs-from"
            label="From"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => {
              const nextFrom = e.target.value;
              setFromDate(nextFrom);
              setToDate((prev) => coerceToDate(nextFrom, prev));
            }}
          />
          <span className="text-sm text-muted">to</span>
          <DateRangeInput
            id="shared-docs-to"
            label="To"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => setToDate(coerceToDate(fromDate, e.target.value))}
          />
        </div>
      </div>

      <p className="mb-4 text-sm text-[#8B6D4F]">
        Showing {rows.length} report{rows.length === 1 ? "" : "s"}
      </p>

      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No shared documents"
          description="No reports match your search, category, or date range."
        />
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <Card className="overflow-hidden p-0">
            <div className="divide-y divide-border/60">
              {paged.items.map((doc) => {
                const badgeLabel = doc.badgeLabel || doc.documentType;
                const isSelected = selectedId === doc.id;

                return (
                  <div
                    key={doc.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(doc.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedId(doc.id);
                      }
                    }}
                    className={cn(
                      "flex cursor-pointer gap-3 bg-white p-4 transition sm:p-5",
                      isSelected
                        ? "bg-cream/60 ring-1 ring-inset ring-primary/25"
                        : "hover:bg-cream/35"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {doc.isNew ? (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full bg-rose-500"
                            aria-hidden="true"
                          />
                        ) : null}
                        <span className="font-semibold text-ink">
                          {doc.employee}
                        </span>
                        <Badge
                          className={
                            reportBadgeStyles[badgeLabel] ||
                            "bg-stone-100 text-stone-700"
                          }
                        >
                          {badgeLabel}
                        </Badge>
                        {doc.isNew ? (
                          <Badge className="bg-rose-50 text-rose-700">New</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1.5 font-semibold text-ink">
                        {doc.title}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                        <span className="inline-flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          {doc.incidentNumber}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 shrink-0" />
                          {doc.dateOfInjury
                            ? `DOI ${doc.dateOfInjury}`
                            : "DOI N/A"}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 shrink-0" />
                          {doc.provider}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 shrink-0" />
                          {doc.shareDate}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-start gap-0.5 pt-0.5">
                      <button
                        type="button"
                        aria-label={`View ${doc.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(doc.id);
                          openPreview(doc);
                        }}
                          className="cursor-pointer rounded-full p-2 text-primary transition hover:bg-sky-50"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Download ${doc.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          openDocumentInNewTab(doc.url);
                        }}
                          className="cursor-pointer rounded-full p-2 text-emerald-600 transition hover:bg-emerald-50"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <Pagination
              page={paged.currentPage}
              totalPages={paged.totalPages}
              total={paged.total}
              start={paged.start}
              end={paged.end}
              onChange={setPage}
            />
          </Card>

          {selected ? (
            <ReportDetailPanel
              doc={selected}
              onClose={() => setSelectedId(null)}
              onPreview={openPreview}
            />
          ) : (
            <EmptyState
              icon={FileText}
              title="Select a report"
              description="View full details, preview, or download."
              className="min-h-80 xl:min-h-[28rem]"
            />
          )}
        </div>
      )}

      {previewFile ? (
        <DocumentPreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      ) : null}
    </div>
  );
}
