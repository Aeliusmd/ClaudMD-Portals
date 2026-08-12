"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Hospital } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DetailField } from "@/components/ui/detail-field";
import { DocumentPreviewModal } from "@/components/ui/document-preview-modal";
import {
  DocumentThumbGrid,
  DocumentThumbTile,
} from "@/components/ui/document-thumb-tile";
import { categoryStyles } from "@/lib/category-styles";
import { formatDateMMDDYY } from "@/lib/dates";
import { cn } from "@/lib/utils";

function displayValue(value) {
  if (value == null || value === "") return "—";
  return value;
}

export function PatientVisitDetailView({
  visit,
  patient,
  showEmployer = true,
  showInsurance = true,
  showWorkStatus = true,
  backHref = "/patient/dashboard",
}) {
  const router = useRouter();
  const [previewDocument, setPreviewDocument] = useState(null);

  const documents = (visit.documents || []).filter((document) => document.url);
  const addressLines =
    patient?.addressLines?.length > 0
      ? patient.addressLines
      : patient?.address
        ? [patient.address]
        : [];

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
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground-900 sm:text-3xl md:text-4xl">
          {visit.provider} — {visit.location}
        </h1>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600">
              <Hospital className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-semibold text-foreground-900">
                {formatDateMMDDYY(visit.date) || visit.date}
              </p>
              <p className="mt-0.5 text-sm text-foreground-500">
                {visit.id} · {visit.category}
              </p>
            </div>
          </div>
          <Badge
            className={cn(
              "shrink-0",
              categoryStyles[visit.category] || "bg-stone-100 text-stone-600"
            )}
          >
            {visit.category}
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
              <div className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                <div className="space-y-2.5">
                  <p className="font-semibold text-foreground-900">
                    {displayValue(patient?.fullName)}
                  </p>
                  <p className="font-semibold tabular-nums text-foreground-900">
                    {displayValue(patient?.dateOfBirth)}
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
                </div>
                <div className="space-y-2.5">
                  <p className="font-semibold tabular-nums text-foreground-900">
                    {displayValue(patient?.phone)}
                  </p>
                  <p className="break-all text-foreground-700">
                    {displayValue(patient?.email)}
                  </p>
                </div>
              </div>

              <div
                className={cn(
                  "grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2",
                  (showInsurance || showEmployer) &&
                    "mt-4 border-t border-border/70 pt-4"
                )}
              >
                {showInsurance ? (
                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.1em] text-foreground-500 uppercase">
                      Insurance
                    </p>
                    <p className="mt-1 font-semibold text-foreground-900">
                      {displayValue(patient?.insurance?.carrier)}
                    </p>
                    {patient?.insurance?.planType ? (
                      <p className="mt-0.5 text-foreground-700">
                        {patient.insurance.planType}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {showEmployer ? (
                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.1em] text-foreground-500 uppercase">
                      Employer
                    </p>
                    <p className="mt-1 font-semibold text-foreground-900">
                      {displayValue(patient?.employer?.name)}
                    </p>
                    {patient?.employer?.department ? (
                      <p className="mt-0.5 text-foreground-700">
                        {patient.employer.department}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <h2 className="border-b border-border/70 px-5 py-4 text-base font-semibold text-foreground-900">
              Visit Details
            </h2>

            <div className="px-5 py-4">
              <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                <DetailField
                  label="Date"
                  value={formatDateMMDDYY(visit.date) || "—"}
                />
                <DetailField label="Provider" value={visit.provider} />
                <DetailField label="Location" value={visit.location} />
                <DetailField label="Status" value={visit.status} />
                {showWorkStatus ? (
                  <DetailField label="Work Status" value={visit.workStatus} />
                ) : null}
                {visit.category !== "Physical" ? (
                  <DetailField label="Restrictions" value={visit.restrictions} />
                ) : null}
                <DetailField label="Follow-up" value={visit.followUp} />
              </div>

              {visit.specialInstructions ? (
                <div className="mt-4 border-t border-border/70 pt-4">
                  <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                    Special Instructions
                  </p>
                  <div className="mt-2 rounded-xl bg-cream px-4 py-3">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground-700">
                      {visit.specialInstructions}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        </div>

        <div className="min-h-[18rem] w-full min-w-0 self-stretch rounded-2xl bg-foreground-900 p-4 shadow-sm sm:min-h-[22rem] sm:p-5 xl:min-h-full">
          {documents.length === 0 ? (
            <div className="flex h-full min-h-[16rem] items-center justify-center rounded-xl bg-white/5 text-sm text-white/70">
              No documents for this visit.
            </div>
          ) : (
            <DocumentThumbGrid>
              {documents.map((document) => (
                <DocumentThumbTile
                  key={document.id}
                  doc={document}
                  selectedVisit={visit}
                  onPreview={setPreviewDocument}
                />
              ))}
            </DocumentThumbGrid>
          )}
        </div>
      </div>

      {previewDocument ? (
        <DocumentPreviewModal
          file={{ ...previewDocument, visitDate: visit.date }}
          onClose={() => setPreviewDocument(null)}
        />
      ) : null}
    </div>
  );
}
