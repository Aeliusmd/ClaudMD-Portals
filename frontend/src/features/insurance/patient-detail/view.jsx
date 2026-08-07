"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DocumentPreviewModal } from "@/components/ui/document-preview-modal";
import { PdfThumbnail } from "@/components/ui/pdf-thumbnail";
import { coverageStyles } from "@/lib/category-styles";
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
  if (
    doc.documentType?.includes("Doctor First") ||
    doc.documentType?.includes("Doctor's First")
  ) {
    return "DFR";
  }
  if (doc.documentType?.includes("Physical")) return "PR";
  return "DOC";
}

function docCaption(doc, selectedVisit) {
  const date = doc.visitDate || selectedVisit?.date || "";
  const label = shortDocLabel(doc);
  return `${date} ${label}`.trim();
}

function VisitDocumentThumb({ doc, selectedVisit, onPreview }) {
  const badge = shortDocLabel(doc);
  const url = doc.url;
  if (!url) return null;

  return (
    <div className="w-[8.5rem] shrink-0 sm:w-40">
      <PdfThumbnail
        url={url}
        badge={badge}
        title={doc.title || doc.name || "Document"}
        onOpen={() =>
          onPreview({
            ...doc,
            url,
            previewBadge: badge,
          })
        }
      />
      <p className="mt-2.5 text-center text-xs font-medium text-white sm:text-sm">
        {docCaption(doc, selectedVisit)}
      </p>
    </div>
  );
}

export function InsurancePatientDetailView({ patient, backHref }) {
  const router = useRouter();
  const visits = patient?.visits || [];
  const [selectedVisitId, setSelectedVisitId] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);

  useEffect(() => {
    const nextVisits = patient?.visits || [];
    if (!nextVisits.length) {
      setSelectedVisitId(null);
      return;
    }
    const preferred =
      nextVisits.find((visit) => (visit.documents || []).length > 0) ||
      nextVisits[0];
    setSelectedVisitId(preferred?.id || null);
  }, [patient?.id, patient?.visits]);

  const selectedVisit =
    visits.find((visit) => visit.id === selectedVisitId) || visits[0] || null;
  const visitDocuments = (selectedVisit?.documents || []).filter(
    (doc) => doc.url
  );
  const addressLines = patient?.addressLines || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => router.push(backHref)}
          className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-cream"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground-900 md:text-4xl">
          {patient.patient}
        </h1>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600">
              <UserRound className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-semibold text-foreground-900">
                {patient.patient}
              </p>
              <p className="mt-0.5 text-sm tabular-nums text-foreground-500">
                {[patient.patientId, patient.accountNo]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>
          <Badge
            className={cn(
              "shrink-0",
              coverageStyles[patient.coverage] || "bg-stone-100 text-stone-600"
            )}
          >
            {patient.coverage}
          </Badge>
        </div>
      </Card>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <div className="min-w-0 space-y-5">
          <Card className="overflow-hidden p-0">
            <h2 className="border-b border-border/70 px-5 py-4 text-base font-semibold text-foreground-900">
              Patient Demographics
            </h2>

            <div className="px-5 py-4">
              <div className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                <div className="space-y-2.5">
                  <p className="font-semibold tabular-nums text-foreground-900">
                    {patient.accountNo || "—"}
                  </p>
                  <p className="font-semibold tabular-nums text-foreground-900">
                    {patient.dateOfBirth || "—"}
                  </p>
                  <p className="font-semibold text-foreground-900">
                    {patient.patient}
                  </p>
                  {addressLines.length > 0 ? (
                    addressLines.map((line) => (
                      <p key={line} className="text-foreground-700">
                        {line}
                      </p>
                    ))
                  ) : (
                    <p className="text-foreground-700">—</p>
                  )}
                  <p className="tabular-nums text-foreground-700">
                    {patient.phone || "—"}
                  </p>
                </div>
                <div className="space-y-2.5">
                  <p className="font-semibold tabular-nums text-foreground-900">
                    {patient.phone || "—"}
                  </p>
                  <p className="text-foreground-900">{patient.gender || "—"}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-x-8 gap-y-4 border-t border-border/70 pt-4 text-sm sm:grid-cols-2">
                {patient.employer ? (
                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.1em] text-foreground-500 uppercase">
                      Employer
                    </p>
                    <p className="mt-1 font-semibold text-foreground-900">
                      {patient.employer}
                    </p>
                  </div>
                ) : null}
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.1em] text-foreground-500 uppercase">
                    Insurance
                  </p>
                  <p className="mt-1 font-semibold text-foreground-900">
                    {patient.insurance || "—"}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border/70 bg-white text-base font-semibold text-foreground-900">
                  <tr>
                    <th className="px-5 py-4">Date</th>
                    <th className="px-5 py-4">Visit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {visits.length === 0 ? (
                    <tr>
                      <td
                        colSpan={2}
                        className="px-5 py-8 text-sm text-foreground-500"
                      >
                        No visits found for this patient.
                      </td>
                    </tr>
                  ) : (
                    visits.map((visit) => {
                      const selected = visit.id === selectedVisit?.id;
                      const docCount = (visit.documents || []).filter(
                        (doc) => doc.url
                      ).length;

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
                          <td
                            className={cn(
                              "px-5 py-3.5",
                              selected
                                ? "font-medium text-primary-600"
                                : "text-foreground-900"
                            )}
                          >
                            {visit.label}
                            {docCount > 0 ? (
                              <span className="ml-2 text-[10px] font-semibold tracking-[0.06em] text-foreground-500 uppercase">
                                {docCount} doc{docCount === 1 ? "" : "s"}
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="min-h-[18rem] w-full min-w-0 self-stretch rounded-2xl bg-foreground-900 p-4 shadow-sm sm:min-h-[22rem] sm:p-5 xl:min-h-full">
          {visitDocuments.length === 0 ? (
            <div className="flex h-full min-h-[16rem] items-center justify-center rounded-xl bg-white/5 text-sm text-white/70">
              No documents for this visit.
            </div>
          ) : (
            <div className="flex flex-wrap gap-4">
              {visitDocuments.map((doc) => (
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
