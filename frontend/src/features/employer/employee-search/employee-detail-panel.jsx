"use client";

import { useMemo } from "react";
import { FileText, UserRound, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DetailField } from "@/components/ui/detail-field";
import { sharedDocuments } from "@/data/employer";
import { categoryStyles } from "@/lib/category-styles";
import { openDocumentInNewTab } from "@/lib/documents";
import { reportBadgeStyles } from "@/lib/report-badge-styles";

function shortDocLabel(doc) {
  if (doc.badgeLabel) return doc.badgeLabel;
  if (doc.documentType?.includes("Doctor First")) return "DFR";
  if (doc.documentType?.includes("Work Status")) return "WSR";
  if (doc.documentType?.includes("Physical")) return "PHYS";
  if (doc.documentType?.includes("Status")) return "SR";
  return "DOC";
}

export function EmployeeDetailPanel({
  employee,
  incident,
  checkInDate,
  onClose,
  onPreview,
}) {
  const visits = useMemo(() => {
    if (incident.visits?.length) return incident.visits;
    return [{ id: "base", date: checkInDate || incident.checkInDate, label: "Check-in" }];
  }, [checkInDate, incident]);

  const reports = useMemo(
    () =>
      sharedDocuments
        .filter((doc) => doc.employeeId === employee.id)
        .sort((a, b) => (a.dateValue < b.dateValue ? 1 : -1)),
    [employee.id]
  );

  return (
    <Card className="sticky top-6 overflow-hidden p-0 xl:max-h-[calc(100dvh-8rem)] xl:overflow-y-auto">
      <div className="flex items-start justify-between gap-3 border-b border-border/70 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white">
            <UserRound className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-ink">{employee.name}</h2>
              <Badge className={categoryStyles[incident.category]}>
                {incident.category}
              </Badge>
            </div>
            <p className="mt-0.5 text-sm tabular-nums text-muted">
              {employee.patientId || employee.employeeId} · {employee.accountNo}
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close employee detail"
          onClick={onClose}
          className="cursor-pointer rounded-lg p-2 text-muted transition hover:bg-cream-deep hover:text-ink"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-5 p-5">
        <section>
          <h3 className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
            Employee Demographics
          </h3>
          <div className="rounded-xl border border-border/70 bg-cream/30 p-4 text-sm">
            <div className="space-y-2 text-sm">
              <DetailField label="Full Name" value={employee.name || "—"} />
              <DetailField
                label="Account #"
                value={employee.accountNo || "—"}
              />
              <DetailField label="Phone" value={employee.phone || "—"} />
              <DetailField
                label="DOB"
                value={employee.dateOfBirth || "—"}
              />
              <DetailField
                label="Gender"
                value={employee.gender || "—"}
              />
              <DetailField
                label="Address"
                value={employee.address || "—"}
              />
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
            Date of Visit
          </h3>
          <div className="space-y-2">
            {visits.map((visit) => (
              <button
                key={visit.id}
                type="button"
                className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-border/70 bg-white px-3.5 py-3 text-left transition hover:border-primary/30 hover:bg-cream/40"
              >
                <span className="text-sm font-semibold tabular-nums text-ink">
                  {visit.date}
                </span>
                <span className="text-sm text-muted">
                  {visit.label || "Visit"}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
            Reports
          </h3>
          <div className="space-y-2">
            {reports.length === 0 ? (
              <p className="text-sm text-muted">No shared reports.</p>
            ) : (
              reports.map((doc) => {
                const label = shortDocLabel(doc);
                return (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3.5 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          className={
                            reportBadgeStyles[doc.documentType] ||
                            reportBadgeStyles[label] ||
                            "bg-stone-100 text-stone-700"
                          }
                        >
                          {label}
                        </Badge>
                        <span className="text-sm tabular-nums text-muted">
                          {doc.visitDate || doc.shareDate}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm font-medium text-ink">
                        {doc.title}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        aria-label={`Preview ${doc.title}`}
                        onClick={() =>
                          onPreview({
                            title: doc.title,
                            documentId: doc.documentId,
                            url: doc.url,
                          })
                        }
                        className="cursor-pointer rounded-lg p-2 text-primary transition hover:bg-sky-50"
                      >
                        <FileText className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Download ${doc.title}`}
                        onClick={() => openDocumentInNewTab(doc.url)}
                        className="cursor-pointer rounded-lg px-2 py-1.5 text-xs font-semibold text-muted transition hover:bg-cream-deep hover:text-ink"
                      >
                        DL
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </Card>
  );
}
