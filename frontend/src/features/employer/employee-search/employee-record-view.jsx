"use client";

import { useEffect, useMemo, useState } from "react";
import { UserRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DocumentPreviewModal } from "@/components/ui/document-preview-modal";
import { PdfThumbnail } from "@/components/ui/pdf-thumbnail";
import { SkeletonBlock } from "@/components/ui/skeleton";
import { employees as mockEmployees } from "@/data/employer";
import { fetchEmployeeVisits } from "@/lib/api/employer";
import { getAccessToken } from "@/lib/auth-session";
import { SAMPLE_DOCUMENT_URL } from "@/lib/documents";
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
  const badge = shortDocLabel(doc);
  const url = doc.url || SAMPLE_DOCUMENT_URL;

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

function VisitInfoRow({ label, value }) {
  if (!value || value === "—") return null;
  return (
    <div className="grid gap-1 sm:grid-cols-[7.5rem_1fr] sm:gap-3">
      <dt className="text-xs font-semibold tracking-[0.06em] text-foreground-500 uppercase">
        {label}
      </dt>
      <dd className="text-sm font-medium text-foreground-900">{value}</dd>
    </div>
  );
}

function UpcomingAppointmentDetails({ visit }) {
  const timeRange =
    visit.time && visit.endTime
      ? `${visit.time} – ${visit.endTime}`
      : visit.time || null;
  const reference = visit.scheduleId || visit.appointmentId;

  return (
    <Card className="p-5">
      <p className="text-[11px] font-bold tracking-[0.1em] text-primary-600 uppercase">
        Upcoming Appointment
      </p>
      <h3 className="mt-2 text-lg font-bold text-foreground-900">
        {visit.label || "Appointment"}
      </h3>
      <dl className="mt-4 space-y-3">
        <VisitInfoRow label="Date" value={visit.date} />
        <VisitInfoRow label="Time" value={timeRange} />
        <VisitInfoRow label="Category" value={visit.category} />
        <VisitInfoRow label="Provider" value={visit.provider} />
        <VisitInfoRow label="Location" value={visit.clinic} />
        <VisitInfoRow label="Status" value={visit.status} />
        {visit.durationMinutes ? (
          <VisitInfoRow
            label="Duration"
            value={`${visit.durationMinutes} minutes`}
          />
        ) : null}
        {reference ? (
          <VisitInfoRow label="Reference #" value={String(reference)} />
        ) : null}
        <VisitInfoRow label="Note" value={visit.note} />
      </dl>
    </Card>
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

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="p-5 xl:col-start-1 xl:row-start-1">
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

        <Card className="overflow-hidden p-0 xl:col-start-1 xl:row-start-2">
          <div className="border-b border-background-200 bg-background-50 px-5 py-3">
            <SkeletonBlock className="h-3 w-40" />
          </div>
          <div className="space-y-3 p-5">
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
          </div>
        </Card>

        <div className="min-h-[18rem] w-full min-w-0 self-stretch rounded-2xl bg-foreground-900 p-4 shadow-sm sm:min-h-[22rem] sm:p-5 xl:col-start-2 xl:row-start-1 xl:row-span-2 xl:min-h-full">
          <div className="flex flex-wrap gap-4">
            <div className="w-[8.5rem] shrink-0 sm:w-40">
              <div className="aspect-[17/22] w-full animate-pulse rounded-xl bg-white/20" />
              <div className="mx-auto mt-2.5 h-4 w-24 animate-pulse rounded bg-white/20" />
            </div>
            <div className="w-[8.5rem] shrink-0 sm:w-40">
              <div className="aspect-[17/22] w-full animate-pulse rounded-xl bg-white/20" />
              <div className="mx-auto mt-2.5 h-4 w-24 animate-pulse rounded bg-white/20" />
            </div>
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

function resolveNumericPatientId(employee) {
  if (!employee) return null;
  if (employee.numericPatientId != null) return Number(employee.numericPatientId);
  if (employee.patientId != null && /^\d+$/.test(String(employee.patientId))) {
    return Number(employee.patientId);
  }
  if (employee.id != null && /^\d+$/.test(String(employee.id))) {
    return Number(employee.id);
  }
  const fromVisit = employee.incidents?.[0]?.visits?.[0]?.id;
  if (fromVisit != null && /^\d+$/.test(String(fromVisit))) {
    // visit id is check-in id, not patient — skip
  }
  const digits = String(employee.patientId || "")
    .replace(/^p-/i, "")
    .replace(/^acc-/i, "")
    .replace(/\D/g, "");
  if (digits && /^\d+$/.test(digits) && String(employee.id) === digits) {
    return Number(digits);
  }
  if (employee.id != null && /^\d+$/.test(String(employee.id))) {
    return Number(employee.id);
  }
  return null;
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

  const fallbackVisits = useMemo(() => {
    if (!profile) return [];
    const incident = profile.incidents?.[0];
    if (incident?.visits?.length) {
      return incident.visits.map((visit) => ({
        ...visit,
        id: String(visit.id),
        documents: [],
      }));
    }
    return [
      {
        id: "base",
        date: incident?.checkInDate || "—",
        label: incident?.reportType || "Visit",
        documents: [],
      },
    ];
  }, [profile]);

  const [apiVisits, setApiVisits] = useState(null);
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [selectedVisitId, setSelectedVisitId] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);

  const visits = apiVisits || fallbackVisits;

  useEffect(() => {
    if (!profile) return undefined;

    const patientId = resolveNumericPatientId(profile);
    if (!patientId) {
      setApiVisits(null);
      return undefined;
    }

    let cancelled = false;

    async function loadVisits() {
      const token = getAccessToken();
      if (!token) return;

      setLoadingVisits(true);
      try {
        const data = await fetchEmployeeVisits(token, patientId);
        if (cancelled) return;
        setApiVisits(data.visits || []);
      } catch {
        if (!cancelled) setApiVisits(null);
      } finally {
        if (!cancelled) setLoadingVisits(false);
      }
    }

    loadVisits();
    return () => {
      cancelled = true;
    };
  }, [profile]);

  useEffect(() => {
    if (!visits.length) {
      setSelectedVisitId(null);
      return;
    }
    const preferred =
      visits.find((visit) => !visit.isUpcoming && (visit.documents || []).length > 0) ||
      visits.find((visit) => !visit.isUpcoming) ||
      visits[0];
    setSelectedVisitId(preferred?.id || null);
  }, [profile?.id, visits]);

  const selectedVisit =
    visits.find((visit) => visit.id === selectedVisitId) || visits[0] || null;

  const visitDocs = selectedVisit?.documents || [];

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
                  {loadingVisits && !apiVisits ? (
                    <tr>
                      <td colSpan={2} className="px-5 py-4 text-muted">
                        Loading visits…
                      </td>
                    </tr>
                  ) : visits.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-5 py-4 text-muted">
                        No visits found.
                      </td>
                    </tr>
                  ) : (
                    visits.map((visit) => {
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
                            {visit.isUpcoming ? (
                              <span className="ml-2 text-[10px] font-bold tracking-[0.08em] text-primary-500 uppercase">
                                Upcoming
                              </span>
                            ) : null}
                            {!visit.isUpcoming && (visit.documents || []).length > 0 ? (
                              <span className="ml-2 text-[10px] font-semibold tracking-[0.06em] text-foreground-500 uppercase">
                                {(visit.documents || []).length} doc
                                {(visit.documents || []).length === 1 ? "" : "s"}
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

          {selectedVisit?.isUpcoming ? (
            <UpcomingAppointmentDetails visit={selectedVisit} />
          ) : null}
        </div>

        {/* Documents from DocterPublishes for the selected visit (half screen) */}
        <div className="min-h-[18rem] w-full min-w-0 self-stretch rounded-2xl bg-foreground-900 p-4 shadow-sm sm:min-h-[22rem] sm:p-5 xl:min-h-full">
          {selectedVisit?.isUpcoming ? (
            <div className="flex h-full min-h-[16rem] items-center justify-center rounded-xl bg-white/5 text-sm text-white/70">
              Documents appear after the visit is completed.
            </div>
          ) : visitDocs.length === 0 ? (
            <div className="flex h-full min-h-[16rem] items-center justify-center rounded-xl bg-white/5 text-sm text-white/70">
              {loadingVisits && !apiVisits
                ? "Loading documents…"
                : "No documents for this visit."}
            </div>
          ) : (
            <div className="flex flex-wrap gap-4">
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
