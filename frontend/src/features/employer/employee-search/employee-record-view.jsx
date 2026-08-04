"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, UserRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DocumentPreviewModal } from "@/components/ui/document-preview-modal";
import { sharedDocuments } from "@/data/employer";
import { cn } from "@/lib/utils";

function shortDocLabel(doc) {
  if (doc.previewBadge) return doc.previewBadge;
  if (doc.previewLabel === "PT report") return "PR";
  if (doc.previewLabel) return doc.previewLabel;
  if (
    doc.badgeLabel === "Work Status" ||
    doc.documentType?.includes("Work Status")
  ) {
    return "WSR";
  }
  if (doc.documentType?.includes("Doctor First")) return "DFR";
  if (doc.documentType?.includes("Physical")) return "PR";
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
  const asDate = new Date(value);
  if (!Number.isNaN(asDate.getTime())) {
    return asDate.toLocaleDateString("en-US");
  }
  return value;
}

function VisitDocumentThumb({ doc, selectedVisit, onPreview }) {
  const label = shortDocLabel(doc);

  return (
    <div className="min-w-0 w-full">
      <button
        type="button"
        onClick={() => onPreview(doc)}
        className="flex aspect-[3/4] w-full max-h-72 cursor-pointer flex-col items-center justify-center rounded-xl bg-white shadow-sm transition hover:ring-2 hover:ring-primary-400/50 sm:max-h-80"
      >
        <div className="flex h-14 w-12 flex-col items-center justify-center rounded-md bg-background-100 text-foreground-700">
          <FileText className="h-5 w-5" />
          <span className="mt-1 text-[10px] font-bold tracking-wide">
            {label}
          </span>
        </div>
      </button>
      <p className="mt-2.5 text-center text-xs font-medium text-white sm:text-sm">
        {docCaption(doc, selectedVisit)}
      </p>
    </div>
  );
}

export function EmployeeRecordView({
  employee,
  onBack,
  backLabel = "← Back to search",
}) {
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
    return sharedDocuments.filter((doc) => doc.employeeId === employee.id);
  }, [employee.id, selectedVisit]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground-900 md:text-4xl">
          {employee.name}
        </h1>
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="cursor-pointer text-sm font-semibold text-primary-500 hover:text-primary-600"
          >
            {backLabel}
          </button>
        ) : null}
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600">
            <UserRound className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-foreground-900">
              {employee.name}
            </p>
            <p className="mt-0.5 text-sm tabular-nums text-foreground-500">
              {employee.patientId || employee.employeeId} · {employee.accountNo}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <div className="min-w-0 space-y-5">
          <Card className="p-5">
            <h2 className="mb-4 text-[11px] font-semibold tracking-[0.1em] text-foreground-500 uppercase">
              Employee Demographics
            </h2>
            <div className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <div className="space-y-2.5">
                <p className="tabular-nums text-foreground-900">
                  {employee.accountNo}
                </p>
                <p className="tabular-nums text-foreground-900">
                  {formatDob(employee.dateOfBirth)}
                </p>
                <p className="font-medium text-foreground-900">{employee.name}</p>
                <p className="text-foreground-900">
                  {employee.address || "Address not on file"}
                </p>
                <p className="tabular-nums text-foreground-900">
                  {employee.phone || "—"}
                </p>
              </div>
              <div className="space-y-2.5">
                <p className="tabular-nums text-foreground-900">
                  {employee.phone || "—"}
                </p>
                <p className="text-foreground-900">{employee.gender || "—"}</p>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-background-200 bg-background-50 text-[11px] font-semibold tracking-[0.08em] text-foreground-500 uppercase">
                  <tr>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Visit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-background-200">
                  {visits.map((visit) => {
                    const selected = visit.id === selectedVisit?.id;
                    return (
                      <tr
                        key={visit.id}
                        onClick={() => setSelectedVisitId(visit.id)}
                        className={cn(
                          "cursor-pointer transition",
                          selected
                            ? "border-l-4 border-l-primary-500 bg-primary-50"
                            : "border-l-4 border-l-transparent bg-white hover:bg-background-50"
                        )}
                      >
                        <td className="px-5 py-3.5 font-semibold tabular-nums text-foreground-900">
                          {visit.date}
                        </td>
                        <td className="px-5 py-3.5 text-foreground-900">
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

        {/* Right half of screen for visit documents */}
        <div className="min-h-[18rem] w-full min-w-0 self-stretch rounded-2xl bg-foreground-900 p-4 shadow-sm sm:min-h-[22rem] sm:p-5 xl:min-h-full">
          {visitDocs.length === 0 ? (
            <div className="flex h-full min-h-[16rem] items-center justify-center rounded-xl bg-white/5 text-sm text-white/70">
              No documents for this visit.
            </div>
          ) : (
            <div
              className={cn(
                "grid gap-4",
                visitDocs.length === 1 && "mx-auto max-w-[12rem] grid-cols-1",
                visitDocs.length === 2 && "grid-cols-2",
                visitDocs.length >= 3 && "grid-cols-2 sm:grid-cols-3"
              )}
            >
              {visitDocs.map((doc) => (
                <VisitDocumentThumb
                  key={doc.id}
                  doc={doc}
                  selectedVisit={selectedVisit}
                  onPreview={setPreviewDocument}
                />
              ))}
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
