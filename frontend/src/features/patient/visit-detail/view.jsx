"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Hospital } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DetailField } from "@/components/ui/detail-field";
import { DocumentPreviewModal } from "@/components/ui/document-preview-modal";
import { PdfThumbnail } from "@/components/ui/pdf-thumbnail";
import { currentPatient } from "@/data/patient";
import { categoryStyles } from "@/lib/category-styles";
import { SAMPLE_DOCUMENT_URL, documentBadge } from "@/lib/documents";
import { cn } from "@/lib/utils";

function DocumentThumb({ document, onPreview }) {
  return (
    <div className="w-[8.5rem] shrink-0 sm:w-40">
      <PdfThumbnail
        url={document.url}
        badge={document.previewBadge}
        title={document.title}
        onOpen={() => onPreview(document)}
      />
      <p className="mt-2.5 line-clamp-2 text-center text-xs font-semibold text-white sm:text-sm">
        {document.title}
      </p>
    </div>
  );
}

export function PatientVisitDetailView({
  visit,
  showEmployer = true,
  showInsurance = true,
  showWorkStatus = true,
  backHref = "/patient/dashboard",
}) {
  const router = useRouter();
  const [previewDocument, setPreviewDocument] = useState(null);

  const documents = (visit.documents || []).map((document, index) => ({
    ...document,
    id: document.id || `${visit.id}-doc-${index}`,
    documentId: document.documentId || `${visit.id}-${index + 1}`,
    url: document.url || SAMPLE_DOCUMENT_URL,
    previewBadge: documentBadge(document.type),
  }));

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
                {visit.date}
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

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <div className="min-w-0 space-y-5">
          <Card className="overflow-hidden p-0">
            <h2 className="border-b border-border/70 px-5 py-4 text-base font-semibold text-foreground-900">
              Patient Demographics
            </h2>

            <div className="px-5 py-4">
              <div className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                <div className="space-y-2.5">
                  <p className="font-semibold text-foreground-900">
                    {currentPatient.fullName}
                  </p>
                  <p className="font-semibold tabular-nums text-foreground-900">
                    {currentPatient.dateOfBirth}
                  </p>
                  <p className="text-foreground-700">{currentPatient.address}</p>
                </div>
                <div className="space-y-2.5">
                  <p className="font-semibold tabular-nums text-foreground-900">
                    {currentPatient.phone}
                  </p>
                  <p className="break-all text-foreground-700">
                    {currentPatient.email}
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
                      {currentPatient.insurance.carrier}
                    </p>
                    <p className="mt-0.5 text-foreground-700">
                      {currentPatient.insurance.planType}
                    </p>
                  </div>
                ) : null}
                {showEmployer ? (
                  <div>
                    <p className="text-[11px] font-semibold tracking-[0.1em] text-foreground-500 uppercase">
                      Employer
                    </p>
                    <p className="mt-1 font-semibold text-foreground-900">
                      {currentPatient.employer.name}
                    </p>
                    <p className="mt-0.5 text-foreground-700">
                      {currentPatient.employer.department}
                    </p>
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
                <DetailField label="Date" value={visit.date} />
                <DetailField label="Provider" value={visit.provider} />
                <DetailField label="Location" value={visit.location} />
                <DetailField label="Status" value={visit.status} />
                {showWorkStatus ? (
                  <DetailField label="Work Status" value={visit.workStatus} />
                ) : null}
                <DetailField label="Restrictions" value={visit.restrictions} />
                <DetailField label="Follow-up" value={visit.followUp} />
              </div>

              {visit.specialInstructions ? (
                <div className="mt-4 border-t border-border/70 pt-4">
                  <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                    Special Instructions
                  </p>
                  <div className="mt-2 rounded-xl bg-cream px-4 py-3">
                    <p className="text-sm leading-relaxed text-foreground-700">
                      {visit.specialInstructions}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </Card>

        </div>

        {/* Documents attached to this visit */}
        <div className="min-h-[18rem] w-full min-w-0 self-stretch rounded-2xl bg-foreground-900 p-4 shadow-sm sm:min-h-[22rem] sm:p-5 xl:min-h-full">
          {documents.length === 0 ? (
            <div className="flex h-full min-h-[16rem] items-center justify-center rounded-xl bg-white/5 text-sm text-white/70">
              No documents for this visit.
            </div>
          ) : (
            <div className="flex flex-wrap gap-4">
              {documents.map((document) => (
                <DocumentThumb
                  key={document.id}
                  document={document}
                  onPreview={setPreviewDocument}
                />
              ))}
            </div>
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
