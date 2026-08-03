"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, UserRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DocumentPreviewModal } from "@/components/ui/document-preview-modal";
import { sharedDocuments } from "@/data/employer";
import { openDocumentInNewTab } from "@/lib/documents";
import { cn } from "@/lib/utils";

function shortDocLabel(doc) {
  if (doc.previewLabel === "PT report") return "PDF";
  if (doc.previewLabel) return doc.previewLabel;
  if (
    doc.badgeLabel === "Work Status" ||
    doc.documentType?.includes("Work Status")
  ) {
    return "WSR";
  }
  if (doc.documentType?.includes("Doctor First")) return "DFR";
  if (doc.documentType?.includes("Physical")) return "PDF";
  return "DOC";
}

function docCaption(doc, selectedVisit) {
  const date = doc.visitDate || selectedVisit?.date || "";
  if (doc.previewLabel) return `${date} ${doc.previewLabel}`.trim();
  const label = shortDocLabel(doc);
  return `${date} ${label}`.trim();
}

function formatDob(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime()) && value.includes("-")) {
    return parsed.toLocaleDateString("en-US");
  }
  // Already human display like "Dec 1, 1986"
  const asDate = new Date(value);
  if (!Number.isNaN(asDate.getTime())) {
    return asDate.toLocaleDateString("en-US");
  }
  return value;
}

export function EmployeeRecordView({ employee, onBack }) {
  const incident = employee.incidents?.[0];
  const visits = useMemo(() => {
    if (incident?.visits?.length) return incident.visits;
    return [
      {
        id: "base",
        date: incident?.checkInDate || "—",
        label: incident?.reportType || "Visit",
      },
    ];
  }, [incident]);

  const [selectedVisitId, setSelectedVisitId] = useState(visits[0]?.id || null);
  const [previewDocument, setPreviewDocument] = useState(null);

  useEffect(() => {
    setSelectedVisitId(visits[0]?.id || null);
  }, [employee.id, visits]);

  const selectedVisit =
    visits.find((visit) => visit.id === selectedVisitId) || visits[0] || null;

  const visitDocs = useMemo(() => {
    if (!selectedVisit) return [];
    const byVisit = sharedDocuments.filter(
      (doc) =>
        doc.employeeId === employee.id &&
        (doc.visitDate === selectedVisit.date ||
          (!doc.visitDate && doc.shareDate === selectedVisit.date))
    );
    if (byVisit.length > 0) return byVisit;
    // Fallback: show employee docs when visit has no linked files
    return sharedDocuments.filter((doc) => doc.employeeId === employee.id);
  }, [employee.id, selectedVisit]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
          {employee.name}
        </h1>
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="cursor-pointer text-sm font-semibold text-primary hover:text-primary-dark"
          >
            ← Back to search
          </button>
        ) : null}
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sky-100 text-primary">
            <UserRound className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-ink">{employee.name}</p>
            <p className="mt-0.5 text-sm tabular-nums text-muted">
              {employee.patientId || employee.employeeId} · {employee.accountNo}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,1.05fr)]">
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="mb-4 text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
              Employee Demographics
            </h2>
            <div className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <div className="space-y-2.5">
                <p className="tabular-nums text-ink">{employee.accountNo}</p>
                <p className="tabular-nums text-ink">
                  {formatDob(employee.dateOfBirth)}
                </p>
                <p className="font-medium text-ink">{employee.name}</p>
                <p className="text-ink">
                  {employee.address || "Address not on file"}
                </p>
                <p className="tabular-nums text-ink">
                  {employee.phone || "—"}
                </p>
              </div>
              <div className="space-y-2.5">
                <p className="tabular-nums text-ink">
                  {employee.phone || "—"}
                </p>
                <p className="text-ink">{employee.gender || "—"}</p>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border/70 bg-cream/40 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                  <tr>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Visit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {visits.map((visit) => {
                    const selected = visit.id === selectedVisit?.id;
                    return (
                      <tr
                        key={visit.id}
                        onClick={() => setSelectedVisitId(visit.id)}
                        className={cn(
                          "cursor-pointer transition",
                          selected ? "bg-sky-50" : "bg-white hover:bg-cream/40"
                        )}
                      >
                        <td className="px-5 py-3.5 font-semibold tabular-nums text-ink">
                          {visit.date}
                        </td>
                        <td className="px-5 py-3.5 text-ink">
                          {visit.label || "Visit"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="rounded-2xl bg-[#3a342f] p-5 shadow-sm sm:p-6">
          {visitDocs.length === 0 ? (
            <div className="flex min-h-72 items-center justify-center rounded-xl bg-white/5 text-sm text-white/70">
              No documents for this visit.
            </div>
          ) : (
            <div
              className={cn(
                "grid gap-5",
                visitDocs.length > 1 ? "sm:grid-cols-2" : "grid-cols-1"
              )}
            >
              {visitDocs.map((doc) => {
                const label = shortDocLabel(doc);
                return (
                  <div key={doc.id} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setPreviewDocument(doc)}
                      className="flex aspect-[3/4] w-full cursor-pointer flex-col items-center justify-center rounded-xl bg-white shadow-sm transition hover:ring-2 hover:ring-primary/40"
                    >
                      <div className="flex h-14 w-12 flex-col items-center justify-center rounded-md bg-[#f3ebe1] text-[#8B6D4F]">
                        <FileText className="h-5 w-5" />
                        <span className="mt-1 text-[10px] font-bold tracking-wide">
                          {label}
                        </span>
                      </div>
                    </button>
                    <p className="mt-3 text-center text-sm font-medium text-white">
                      {docCaption(doc, selectedVisit)}
                    </p>
                    <div className="mt-2 flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewDocument(doc)}
                        className="cursor-pointer text-xs font-semibold text-white/80 underline-offset-2 hover:text-white hover:underline"
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => openDocumentInNewTab(doc.url)}
                        className="cursor-pointer text-xs font-semibold text-white/80 underline-offset-2 hover:text-white hover:underline"
                      >
                        Download
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {previewDocument ? (
        <DocumentPreviewModal
          file={previewDocument}
          onClose={() => setPreviewDocument(null)}
        />
      ) : null}
    </div>
  );
}
