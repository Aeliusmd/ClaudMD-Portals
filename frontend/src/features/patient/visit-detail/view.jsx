"use client";

import { useState } from "react";
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
import { categoryStyles } from "@/lib/category-styles";
import { formatDateMMDDYY, formatDateOfBirth } from "@/lib/dates";
import { cn } from "@/lib/utils";

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
      <button
        type="button"
        onClick={() => router.push(backHref)}
        className="cursor-pointer text-sm font-semibold text-primary-500 hover:text-primary-600"
      >
        ← Back to dashboard
      </button>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600">
              <UserRound className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-semibold text-foreground-900">
                {patient?.fullName || "Patient"}
              </p>
              <p className="mt-0.5 text-sm tabular-nums text-foreground-500">
                {[
                  visit.patientId != null ? `P-${visit.patientId}` : null,
                  formatDateMMDDYY(visit.date) || visit.date,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>
          <Badge
            className={cn(
              "shrink-0",
              categoryStyles[visit.category] || "bg-stone-100 text-stone-600"
            )}
          >
            {visit.visitType || visit.category}
          </Badge>
        </div>
      </Card>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
        <div className="min-w-0 space-y-5">
          <Card className="overflow-hidden p-0">
            <h2 className="border-b border-border/70 px-5 py-4 text-base font-semibold text-foreground-900">
              Patient Demographics
            </h2>

            <div className="space-y-2.5 px-5 py-4 text-sm">
              <DetailField
                label="Account #"
                value={patient?.accountNo || "—"}
              />
              <DetailField
                label="Full Name"
                value={patient?.fullName || "—"}
              />
              <DetailField
                label="Address"
                value={
                  addressLines.length > 0
                    ? addressLines.join(", ")
                    : patient?.address || "—"
                }
              />
              <DetailField label="Phone" value={patient?.phone || "—"} />
              <DetailField
                label="DOB"
                value={formatDateOfBirth(patient?.dateOfBirth)}
              />
              <DetailField label="Gender" value={patient?.gender || "—"} />
              {showInsurance ? (
                <DetailField
                  label="Insurance"
                  value={
                    [patient?.insurance?.carrier, patient?.insurance?.planType]
                      .filter(Boolean)
                      .join(" · ") || "—"
                  }
                />
              ) : null}
              {showEmployer ? (
                <DetailField
                  label="Employer"
                  value={
                    [patient?.employer?.name, patient?.employer?.department]
                      .filter(Boolean)
                      .join(" · ") || "—"
                  }
                />
              ) : null}
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
