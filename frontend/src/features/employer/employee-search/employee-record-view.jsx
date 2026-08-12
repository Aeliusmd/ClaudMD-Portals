"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UserRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DocumentPreviewModal } from "@/components/ui/document-preview-modal";
import {
  DocumentThumbGrid,
  DocumentThumbGridSkeleton,
  DocumentThumbTile,
} from "@/components/ui/document-thumb-tile";
import { DetailField } from "@/components/ui/detail-field";
import { SkeletonBlock } from "@/components/ui/skeleton";
import { fetchEmployeeVisits } from "@/lib/api/employer";
import { getAccessToken } from "@/lib/auth-session";
import { formatDateMMDDYY, formatDateOfBirth } from "@/lib/dates";
import { cn } from "@/lib/utils";

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
        <VisitInfoRow label="Date" value={formatDateMMDDYY(visit.date) || "—"} />
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

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
        <Card className="p-5 xl:col-start-1 xl:row-start-1">
          <h2 className="mb-4 text-[11px] font-bold tracking-[0.1em] text-foreground-500 uppercase">
            Employee Demographics
          </h2>
          <div className="space-y-2.5">
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="h-4 w-36" />
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-32" />
            <SkeletonBlock className="h-4 w-32" />
            <SkeletonBlock className="h-4 w-10" />
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
          <DocumentThumbGridSkeleton count={2} />
        </div>
      </div>
    </div>
  );
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
  const digits = String(employee.patientId || "")
    .replace(/^p-/i, "")
    .replace(/^acc-/i, "")
    .replace(/\D/g, "");
  if (digits && /^\d+$/.test(digits) && String(employee.id) === digits) {
    return Number(digits);
  }
  return null;
}

export function EmployeeRecordView({
  employee,
  onBack,
  backLabel = "← Back to search",
  loading = false,
  fromDate = null,
  toDate = null,
  // Kept for callers/URL context, but visit history is never filtered by KPI type.
  category: _category = null,
}) {
  const profile = employee || null;

  const [apiVisits, setApiVisits] = useState(null);
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [visitsError, setVisitsError] = useState("");
  const [selectedVisitId, setSelectedVisitId] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);
  const scrollYRef = useRef(0);

  const handlePreviewDocument = useCallback((doc) => {
    scrollYRef.current = window.scrollY;
    setPreviewDocument(doc);
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewDocument(null);
    requestAnimationFrame(() => {
      window.scrollTo({ top: scrollYRef.current, left: 0, behavior: "instant" });
    });
  }, []);

  // Visits/documents come only from the clinic DB API — no mock/dummy rows.
  const visits = apiVisits || [];

  useEffect(() => {
    if (!profile) return undefined;

    const patientId = resolveNumericPatientId(profile);
    if (!patientId) {
      setApiVisits([]);
      setVisitsError("Employee id is missing.");
      return undefined;
    }

    let cancelled = false;

    async function loadVisits() {
      const token = getAccessToken();
      if (!token) return;

      setLoadingVisits(true);
      setVisitsError("");
      try {
        // Always load every visit type for this employee.
        // Dashboard KPI tiles (Injury / Physicals / etc.) only filter the list,
        // not the employee record visit history.
        const data = await fetchEmployeeVisits(token, patientId, {
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        });
        if (cancelled) return;
        setApiVisits(data.visits || []);
      } catch (error) {
        if (!cancelled) {
          setApiVisits([]);
          setVisitsError(error?.message || "Unable to load visit documents.");
        }
      } finally {
        if (!cancelled) setLoadingVisits(false);
      }
    }

    loadVisits();
    return () => {
      cancelled = true;
    };
  }, [profile, fromDate, toDate]);

  useEffect(() => {
    if (!visits.length) {
      setSelectedVisitId(null);
      return;
    }
    setSelectedVisitId((current) => {
      if (current && visits.some((visit) => visit.id === current)) {
        return current;
      }
      const preferred =
        visits.find(
          (visit) => !visit.isUpcoming && (visit.documents || []).length > 0
        ) ||
        visits.find((visit) => !visit.isUpcoming) ||
        visits[0];
      return preferred?.id || null;
    });
  }, [profile?.id, visits]);

  const selectedVisit =
    visits.find((visit) => visit.id === selectedVisitId) || visits[0] || null;

  const visitDocs = (selectedVisit?.documents || []).filter((doc) => doc.url);

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

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
        <div className="min-w-0 space-y-5">
          <Card className="p-5">
            <h2 className="mb-4 text-[11px] font-bold tracking-[0.1em] text-foreground-500 uppercase">
              Employee Demographics
            </h2>
            <div className="space-y-2.5 text-sm">
              <DetailField label="Account #" value={profile.accountNo || "—"} />
              <DetailField label="Full Name" value={profile.name || "—"} />
              <DetailField
                label="Address"
                value={profile.address || "Address not on file"}
              />
              <DetailField label="Phone" value={profile.phone || "—"} />
              <DetailField
                label="DOB"
                value={formatDateOfBirth(profile.dateOfBirth)}
              />
              <DetailField label="Gender" value={profile.gender || "—"} />
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
                  {loadingVisits && apiVisits == null ? (
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
                            {formatDateMMDDYY(visit.date) || "—"}
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
            <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-2 rounded-xl bg-white/5 px-4 text-center text-sm text-white/70">
              {loadingVisits && apiVisits == null
                ? "Loading documents…"
                : visitsError
                  ? visitsError
                  : "No documents for this visit."}
            </div>
          ) : (
            <DocumentThumbGrid>
              {visitDocs.map((doc) => (
                <DocumentThumbTile
                  key={doc.id}
                  doc={doc}
                  selectedVisit={selectedVisit}
                  onPreview={handlePreviewDocument}
                />
              ))}
            </DocumentThumbGrid>
          )}
        </div>
      </div>

      {previewDocument ? (
        <DocumentPreviewModal
          file={previewDocument}
          onClose={handleClosePreview}
        />
      ) : null}
    </div>
  );
}
