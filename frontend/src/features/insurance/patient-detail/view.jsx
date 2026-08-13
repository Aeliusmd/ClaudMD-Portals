"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DetailField } from "@/components/ui/detail-field";
import { DocumentPreviewModal } from "@/components/ui/document-preview-modal";
import {
  DocumentThumbGrid,
  DocumentThumbTile,
} from "@/components/ui/document-thumb-tile";
import { coverageStyles } from "@/lib/category-styles";
import { formatDateMMDDYY, formatDateOfBirth } from "@/lib/dates";
import { cn } from "@/lib/utils";

export function InsurancePatientDetailView({
  patient,
  backHref,
  backLabel = "← Back to dashboard",
}) {
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
      <button
        type="button"
        onClick={() => router.push(backHref)}
        className="cursor-pointer text-sm font-semibold text-primary-500 hover:text-primary-600"
      >
        {backLabel}
      </button>

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

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
        <div className="min-w-0 space-y-5">
          <Card className="overflow-hidden p-0">
            <h2 className="border-b border-border/70 px-5 py-4 text-base font-semibold text-foreground-900">
              Patient Demographics
            </h2>

            <div className="px-5 py-4">
              <div className="space-y-2.5 text-sm">
                <DetailField
                  label="Account #"
                  value={patient.accountNo || "—"}
                />
                <DetailField
                  label="Full Name"
                  value={patient.patient || "—"}
                />
                <DetailField
                  label="Address"
                  value={
                    addressLines.length > 0 ? addressLines.join(", ") : "—"
                  }
                />
                <DetailField label="Phone" value={patient.phone || "—"} />
                <DetailField
                  label="DOB"
                  value={formatDateOfBirth(patient.dateOfBirth)}
                />
                <DetailField label="Gender" value={patient.gender || "—"} />
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
                    Insurance Plan
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
                            {formatDateMMDDYY(visit.date) || "—"}
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
            <DocumentThumbGrid>
              {visitDocuments.map((doc) => (
                <DocumentThumbTile
                  key={doc.id}
                  doc={doc}
                  selectedVisit={selectedVisit}
                  onPreview={setPreviewDocument}
                />
              ))}
            </DocumentThumbGrid>
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
