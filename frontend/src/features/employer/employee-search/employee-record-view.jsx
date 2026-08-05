"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, UserRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DocumentPreviewModal } from "@/components/ui/document-preview-modal";
import { SkeletonBlock } from "@/components/ui/skeleton";
import { employees as mockEmployees, sharedDocuments } from "@/data/employer";
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
  if (String(value).includes("/")) return value;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime()) && /\d{4}-\d{2}-\d{2}/.test(String(value))) {
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

export function EmployeeRecordSkeleton({
  onBack,
  backLabel = "← Back to search",
}) {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading employee">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SkeletonBlock className="h-10 w-56" />
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
          <SkeletonBlock className="h-12 w-12 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonBlock className="h-5 w-40" />
            <SkeletonBlock className="h-4 w-48" />
          </div>
        </div>
      </Card>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <div className="min-w-0 space-y-5">
          <Card className="p-5">
            <h2 className="mb-4 text-[11px] font-bold tracking-[0.1em] text-foreground-500 uppercase">
              Employee Demographics
            </h2>
            <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              <div className="space-y-2.5">
                <SkeletonBlock className="h-4 w-28" />
                <SkeletonBlock className="h-4 w-24" />
                <SkeletonBlock className="h-4 w-36" />
                <SkeletonBlock className="h-4 w-full" />
                <SkeletonBlock className="h-4 w-32" />
              </div>
              <div className="space-y-2.5">
                <SkeletonBlock className="h-4 w-32" />
                <SkeletonBlock className="h-4 w-10" />
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="border-b border-background-200 bg-background-50 px-5 py-3">
              <SkeletonBlock className="h-3 w-40" />
            </div>
            <div className="space-y-3 p-5">
              <SkeletonBlock className="h-10 w-full" />
              <SkeletonBlock className="h-10 w-full" />
            </div>
          </Card>
        </div>

        <div className="min-h-[18rem] w-full min-w-0 self-stretch rounded-2xl bg-foreground-900 p-4 shadow-sm sm:min-h-[22rem] sm:p-5 xl:min-h-full">
          <div className="mx-auto flex max-w-[12rem] flex-col items-center gap-3">
            <div className="aspect-[3/4] w-full animate-pulse rounded-xl bg-white/20" />
            <div className="h-4 w-28 animate-pulse rounded bg-white/20" />
          </div>
        </div>
      </div>
    </div>
  );
}

function enrichWithMockProfile(employee) {
  if (!employee?.name) return employee;
  const normalized = employee.name.trim().toLowerCase();
  const mock = mockEmployees.find(
    (item) => item.name.trim().toLowerCase() === normalized
  );
  if (!mock) return employee;

  return {
    ...employee,
    patientId: employee.patientId || mock.patientId,
    accountNo: employee.accountNo || mock.accountNo,
    phone: employee.phone || mock.phone,
    address: employee.address || mock.address,
    dateOfBirth: employee.dateOfBirth || mock.dateOfBirth,
    gender: employee.gender || mock.gender,
    mockEmployeeId: mock.id,
  };
}

export function EmployeeRecordView({
  employee,
  onBack,
  backLabel = "← Back to search",
  loading = false,
}) {
  const profile = useMemo(
    () => (employee ? enrichWithMockProfile(employee) : null),
    [employee]
  );

  const incident = profile?.incidents?.[0];
  const visits = useMemo(() => {
    if (!profile) return [];
    if (incident?.visits?.length) return incident.visits;
    return [
      {
        id: "base",
        date: incident?.checkInDate || "—",
        label: incident?.reportType || "Visit",
      },
    ];
  }, [incident, profile]);

  const [selectedVisitId, setSelectedVisitId] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);

  useEffect(() => {
    setSelectedVisitId(visits[0]?.id || null);
  }, [profile?.id, visits]);

  const selectedVisit =
    visits.find((visit) => visit.id === selectedVisitId) || visits[0] || null;

  const visitDocs = useMemo(() => {
    if (!profile || !selectedVisit) return [];
    const ids = new Set(
      [profile.id, profile.mockEmployeeId].filter(Boolean).map(String)
    );
    const name = (profile.name || "").trim().toLowerCase();

    const matchesEmployee = (doc) =>
      ids.has(String(doc.employeeId)) ||
      (doc.employee || "").trim().toLowerCase() === name;

    const byVisit = sharedDocuments.filter(
      (doc) =>
        matchesEmployee(doc) &&
        (doc.visitDate === selectedVisit.date ||
          (!doc.visitDate && doc.shareDate === selectedVisit.date))
    );
    if (byVisit.length > 0) return byVisit;
    return sharedDocuments.filter(matchesEmployee);
  }, [profile, selectedVisit]);

  if (loading || !profile) {
    return (
      <EmployeeRecordSkeleton onBack={onBack} backLabel={backLabel} />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground-900 md:text-4xl">
          {profile.name}
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
            <p className="text-lg font-bold text-foreground-900">
              {profile.name}
            </p>
            <p className="mt-0.5 text-sm tabular-nums text-foreground-500">
              {profile.patientId || profile.employeeId}
              {profile.accountNo ? `-${profile.accountNo}` : ""}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <div className="min-w-0 space-y-5">
          <Card className="p-5">
            <h2 className="mb-4 text-[11px] font-bold tracking-[0.1em] text-foreground-500 uppercase">
              Employee Demographics
            </h2>
            <div className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <div className="space-y-2.5">
                <p className="font-bold tabular-nums text-foreground-900">
                  {profile.accountNo || "—"}
                </p>
                <p className="font-bold text-foreground-900">{profile.name}</p>
                <p className="font-normal text-foreground-900">
                  {profile.address || "Address not on file"}
                </p>
                <p className="font-normal tabular-nums text-foreground-900">
                  {profile.phone || "—"}
                </p>
              </div>
              <div className="space-y-2.5">
                <p className="font-normal tabular-nums text-foreground-900">
                  {formatDob(profile.dateOfBirth)}
                </p>
                <p className="font-normal text-foreground-900">
                  {profile.gender || "—"}
                </p>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-background-200 bg-background-50 text-[11px] font-bold tracking-[0.08em] text-foreground-500 uppercase">
                  <tr>
                    <th className="px-5 py-3 font-bold">Date</th>
                    <th className="px-5 py-3 font-bold">Visit</th>
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
                        <td
                          className={cn(
                            "px-5 py-3.5 tabular-nums text-foreground-900",
                            selected ? "font-bold" : "font-normal"
                          )}
                        >
                          {visit.date}
                        </td>
                        <td
                          className={cn(
                            "px-5 py-3.5",
                            selected
                              ? "font-bold text-primary-600"
                              : "font-normal text-foreground-900"
                          )}
                        >
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
