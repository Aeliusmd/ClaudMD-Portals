"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Filter, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateRangeInput } from "@/components/ui/date-range-input";
import { EmptyState } from "@/components/ui/empty-state";
import {
  PAGE_SIZE,
  Pagination,
  paginateItems,
} from "@/components/ui/pagination";
import { KpiSkeletonStrip } from "@/components/ui/skeleton";
import { CreatePatientAppointmentModal } from "@/features/patient/appointments/create-appointment-modal";
import {
  fetchPatientDashboardSummary,
  fetchPatientDashboardVisits,
  fetchPatientUpcomingAppointments,
} from "@/lib/api/patient";
import { getAccessToken } from "@/lib/auth-session";
import {
  appointmentStatusStyles,
  categoryStyles,
  specialtyStyle,
  workStatusStyle,
} from "@/lib/category-styles";
import {
  buildDashboardStateParams,
  hrefWithParams,
  parseDashboardStateParams,
  withReturnParams,
} from "@/lib/dashboard-return-state";
import { patientPaths } from "@/lib/portal-paths";
import {
  coerceToDate,
  DATE_RANGE_ERROR,
  daysAgoIso,
  isInvalidDateRange,
  todayIso,
} from "@/lib/date-range";
import { searchQueryError } from "@/lib/text-validation";
import { cn } from "@/lib/utils";

const emptySubscribe = () => () => {};

/** Tabs that load live CheckInsHeader rows by VisitTypes.CategoryId. */
const LIVE_VISIT_TABS = new Set([
  "urgentCare",
  "personalInjury",
  "physicals",
  "injury",
]);

/** Work status only applies to injury-related care, so the other tabs drop that column. */
const kpiTabs = [
  {
    key: "urgentCare",
    label: "Urgent Care",
    title: "Urgent Care Visits",
    category: "Urgent Care",
    hideWorkStatus: true,
  },
  {
    key: "personalInjury",
    label: "Personal Injury",
    title: "Personal Injury Visits",
    category: "Personal Injury",
    hideWorkStatus: true,
  },
  {
    key: "physicals",
    label: "Physicals",
    title: "Physicals",
    category: "Physical",
    hideWorkStatus: true,
  },
  {
    key: "injury",
    label: "Injury",
    title: "Injury Visits",
    category: "Injury",
  },
  {
    key: "appointments",
    label: "Appointments",
    title: "Upcoming Appointments",
    showAdd: true,
  },
  /** Read-only counter — it does not filter the table. */
  {
    key: "unreadReports",
    label: "Unread Reports",
    readOnly: true,
  },
];

const emptySummary = {
  urgentCare: 0,
  personalInjury: 0,
  physicals: 0,
  injury: 0,
  appointments: 0,
  unreadReports: 0,
};

export function PatientDashboardView() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 sm:space-y-5">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Dashboard
          </h1>
          <KpiSkeletonStrip count={4} />
        </div>
      }
    >
      <PatientDashboardContent />
    </Suspense>
  );
}

function PatientDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = parseDashboardStateParams(searchParams);

  const defaultTo = useSyncExternalStore(emptySubscribe, todayIso, () => "");
  const defaultFrom = useSyncExternalStore(
    emptySubscribe,
    () => daysAgoIso(30),
    () => ""
  );

  const validTabs = new Set([
    "urgentCare",
    "personalInjury",
    "physicals",
    "injury",
    "appointments",
  ]);
  const initialTab =
    initial.tab && validTabs.has(initial.tab) ? initial.tab : "urgentCare";

  const [activeTab, setActiveTab] = useState(initialTab);
  const [draftQuery, setDraftQuery] = useState(initial.search || "");
  const [draftFromDate, setDraftFromDate] = useState(initial.fromDate);
  const [draftToDate, setDraftToDate] = useState(initial.toDate);
  const [appliedQuery, setAppliedQuery] = useState(initial.search || "");
  const [appliedFromDate, setAppliedFromDate] = useState(initial.fromDate);
  const [appliedToDate, setAppliedToDate] = useState(initial.toDate);

  const effectiveDraftFrom = draftFromDate ?? defaultFrom;
  const effectiveDraftTo = draftToDate ?? defaultTo;
  const effectiveAppliedFrom = appliedFromDate ?? defaultFrom;
  const effectiveAppliedTo = appliedToDate ?? defaultTo;
  const rangeReady = Boolean(defaultFrom && defaultTo);

  const [visitPage, setVisitPage] = useState(1);
  const [appointmentPage, setAppointmentPage] = useState(1);
  const [createdAppointments, setCreatedAppointments] = useState([]);
  const [showCreateAppt, setShowCreateAppt] = useState(false);
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summaryError, setSummaryError] = useState(null);
  const [liveVisits, setLiveVisits] = useState([]);
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [visitsError, setVisitsError] = useState(null);
  const [filterError, setFilterError] = useState(null);
  const [liveAppointments, setLiveAppointments] = useState([]);
  const [appointmentsTotal, setAppointmentsTotal] = useState(0);
  const [appointmentsTotalPages, setAppointmentsTotalPages] = useState(1);
  const [loadingAppointments, setLoadingAppointments] = useState(true);
  const [appointmentsError, setAppointmentsError] = useState(null);

  const [appointmentsReloadKey, setAppointmentsReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      const token = getAccessToken();
      if (!token) {
        router.replace(patientPaths.login);
        return;
      }

      setLoadingSummary(true);
      try {
        const data = await fetchPatientDashboardSummary(token);
        if (!cancelled) {
          setSummary(data);
          setSummaryError(null);
        }
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 401) {
          router.replace(patientPaths.login);
          return;
        }
        setSummaryError(
          err?.message || "Unable to load dashboard counts."
        );
        setSummary(emptySummary);
      } finally {
        if (!cancelled) setLoadingSummary(false);
      }
    }

    loadSummary();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function loadVisits() {
      if (!activeTab || !LIVE_VISIT_TABS.has(activeTab)) {
        setLiveVisits([]);
        setVisitsError(null);
        setLoadingVisits(false);
        return;
      }

      if (!rangeReady || !effectiveAppliedFrom || !effectiveAppliedTo) {
        return;
      }

      const token = getAccessToken();
      if (!token) {
        router.replace(patientPaths.login);
        return;
      }

      setLoadingVisits(true);
      try {
        const data = await fetchPatientDashboardVisits(token, {
          category: activeTab,
          fromDate: effectiveAppliedFrom,
          toDate: effectiveAppliedTo,
          search: appliedQuery || undefined,
        });
        if (!cancelled) {
          setLiveVisits(data.items || []);
          setVisitsError(null);
        }
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 401) {
          router.replace(patientPaths.login);
          return;
        }
        setLiveVisits([]);
        setVisitsError(err?.message || "Unable to load visits.");
      } finally {
        if (!cancelled) setLoadingVisits(false);
      }
    }

    loadVisits();
    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    appliedQuery,
    effectiveAppliedFrom,
    effectiveAppliedTo,
    rangeReady,
    router,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadAppointments() {
      const token = getAccessToken();
      if (!token) {
        router.replace(patientPaths.login);
        return;
      }

      setLoadingAppointments(true);
      try {
        const data = await fetchPatientUpcomingAppointments(token, {
          page: appointmentPage,
          pageSize: PAGE_SIZE,
        });
        if (!cancelled) {
          setLiveAppointments(data.items || []);
          setAppointmentsTotal(data.total || 0);
          setAppointmentsTotalPages(data.totalPages || 1);
          setAppointmentsError(null);
        }
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 401) {
          router.replace(patientPaths.login);
          return;
        }
        setLiveAppointments([]);
        setAppointmentsTotal(0);
        setAppointmentsTotalPages(1);
        setAppointmentsError(
          err?.message || "Unable to load upcoming appointments."
        );
      } finally {
        if (!cancelled) setLoadingAppointments(false);
      }
    }

    loadAppointments();
    return () => {
      cancelled = true;
    };
  }, [appointmentPage, appointmentsReloadKey, router]);

  const upcomingAppointments = useMemo(() => {
    // In-session creates from the modal stay visible until list reloads.
    if (appointmentPage !== 1 || createdAppointments.length === 0) {
      return liveAppointments;
    }
    const liveIds = new Set(liveAppointments.map((item) => item.id));
    const extras = createdAppointments.filter((item) => !liveIds.has(item.id));
    return [...extras, ...liveAppointments];
  }, [appointmentPage, createdAppointments, liveAppointments]);

  const stats = summary || emptySummary;

  const isAppointmentsTab = activeTab === "appointments";
  const filteredVisits = LIVE_VISIT_TABS.has(activeTab) ? liveVisits : [];
  const pagedVisits = paginateItems(filteredVisits, visitPage, PAGE_SIZE);

  const appointmentStart =
    appointmentsTotal === 0 ? 0 : (appointmentPage - 1) * PAGE_SIZE + 1;
  const appointmentEnd = Math.min(
    appointmentPage * PAGE_SIZE,
    appointmentsTotal
  );

  const activeTabConfig = kpiTabs.find((item) => item.key === activeTab);
  const tableTitle = activeTabConfig?.title || "All Visits";
  const showWorkStatus = !activeTabConfig?.hideWorkStatus;

  const leftLoading = isAppointmentsTab
    ? loadingAppointments
    : loadingVisits && LIVE_VISIT_TABS.has(activeTab);
  const leftError = isAppointmentsTab
    ? appointmentsError
    : LIVE_VISIT_TABS.has(activeTab)
      ? visitsError
      : null;
  const leftCount = isAppointmentsTab
    ? appointmentsTotal
    : filteredVisits.length;
  const leftEmpty = isAppointmentsTab
    ? !loadingAppointments && upcomingAppointments.length === 0
    : !leftLoading && filteredVisits.length === 0;

  function handleTabClick(key) {
    setActiveTab((prev) => (prev === key ? null : key));
    setVisitPage(1);
  }

  useEffect(() => {
    const next = buildDashboardStateParams({
      tab: activeTab,
      search: appliedQuery,
      fromDate: effectiveAppliedFrom,
      toDate: effectiveAppliedTo,
    });
    const nextQs = next.toString();
    const currentQs = buildDashboardStateParams(
      parseDashboardStateParams(searchParams)
    ).toString();
    if (nextQs !== currentQs) {
      router.replace(hrefWithParams(patientPaths.dashboard, next), {
        scroll: false,
      });
    }
  }, [
    activeTab,
    appliedQuery,
    effectiveAppliedFrom,
    effectiveAppliedTo,
    router,
    searchParams,
  ]);

  function openVisitDetail(visitId) {
    const params = new URLSearchParams();
    const returnParams = buildDashboardStateParams({
      tab: activeTab,
      search: appliedQuery,
      fromDate: effectiveAppliedFrom,
      toDate: effectiveAppliedTo,
    });
    withReturnParams(params, returnParams);
    const qs = params.toString();
    router.push(
      `${patientPaths.visits}/${encodeURIComponent(visitId)}${
        qs ? `?${qs}` : ""
      }`
    );
  }

  function applyFilters() {
    const from = effectiveDraftFrom;
    const to = effectiveDraftTo;
    if (isInvalidDateRange(from, to)) {
      setFilterError(DATE_RANGE_ERROR);
      return;
    }
    const searchErr = searchQueryError(draftQuery);
    if (searchErr) {
      setFilterError(searchErr);
      return;
    }
    setFilterError(null);
    setAppliedQuery(draftQuery.trim());
    setAppliedFromDate(from);
    setAppliedToDate(to);
    setVisitPage(1);
  }

  function clearDateRange() {
    setDraftFromDate(null);
    setDraftToDate(null);
    setAppliedFromDate(null);
    setAppliedToDate(null);
    setDraftQuery("");
    setAppliedQuery("");
    setFilterError(null);
    setVisitPage(1);
  }

  function handleSearchChange(event) {
    const next = event.target.value;
    setDraftQuery(next);
    const searchErr = searchQueryError(next);
    setFilterError((prev) => {
      if (searchErr) return searchErr;
      if (prev === DATE_RANGE_ERROR) return prev;
      return null;
    });
  }

  function handleFromDateChange(event) {
    const nextFrom = event.target.value;
    setDraftFromDate(nextFrom);
    setDraftToDate((prev) => {
      const currentTo = prev ?? defaultTo;
      return coerceToDate(nextFrom, currentTo);
    });
    setFilterError(null);
  }

  function handleToDateChange(event) {
    setDraftToDate(coerceToDate(effectiveDraftFrom, event.target.value));
    setFilterError(null);
  }

  function handleCreateAppointment(appointment) {
    setCreatedAppointments((prev) => [appointment, ...prev]);
    setActiveTab("appointments");
    setAppointmentPage(1);
    setAppointmentsReloadKey((key) => key + 1);
    setSummary((prev) =>
      prev
        ? { ...prev, appointments: (prev.appointments || 0) + 1 }
        : prev
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        Last 30 Days
      </h1>

      {summaryError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {summaryError}
        </p>
      ) : null}

      {loadingSummary || !summary ? (
        <KpiSkeletonStrip count={6} />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-primary-800 text-white shadow-sm">
          <div className="grid grid-cols-3 lg:grid-cols-6">
            {kpiTabs.map((item, index) => {
              const active = activeTab === item.key;
              // Mobile/tablet: 3-col grid → two rows of 3; desktop: single row of 6.
              const isTopRowMobile = index < 3;
              const isNotLastInRowMobile = index % 3 !== 2;

              const cellClass = cn(
                "relative px-3 py-4 text-center transition sm:px-4 sm:py-5 lg:px-5",
                item.readOnly
                  ? "cursor-default"
                  : cn(
                      "cursor-pointer",
                      active ? "bg-primary-700" : "hover:bg-white/5"
                    ),
                // Mobile row separators only. Avoid border-r + lg:border-r-0 conflicts
                // that left a lone white divider between Physicals and Injury on desktop.
                isTopRowMobile && "border-b border-white/10 lg:border-b-0",
                isNotLastInRowMobile && "max-lg:border-r max-lg:border-white/10"
              );

              const cellContent = (
                <>
                  <div className="flex items-center justify-center gap-1.5">
                    <p className="text-[10px] font-semibold tracking-[0.12em] text-white/70 uppercase sm:text-[11px] sm:tracking-[0.14em]">
                      {item.label}
                    </p>
                    {item.showAdd ? (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label="Create appointment"
                        onClick={(event) => {
                          event.stopPropagation();
                          setShowCreateAppt(true);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            setShowCreateAppt(true);
                          }
                        }}
                        className="inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary-500 text-white ring-2 ring-white/25"
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 font-sans text-4xl font-semibold tabular-nums leading-none sm:text-5xl lg:text-[3.25rem]">
                    {stats[item.key]}
                  </p>
                </>
              );

              if (item.readOnly) {
                return (
                  <div key={item.key} className={cellClass}>
                    {cellContent}
                  </div>
                );
              }

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleTabClick(item.key)}
                  className={cellClass}
                >
                  {cellContent}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2.5 rounded-2xl border border-border/70 bg-white p-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:px-4 sm:py-3">
        <label className="relative block min-w-0 flex-1 sm:min-w-[12rem]">
          <span className="sr-only">Search visits</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={draftQuery}
            onChange={handleSearchChange}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyFilters();
              }
            }}
            placeholder="Search visits by provider, location, or ID..."
            className="w-full rounded-xl border border-border/80 bg-white py-2.5 pr-4 pl-10 text-sm text-ink outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </label>
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
          <DateRangeInput
            id="patient-dashboard-from"
            label="From"
            value={effectiveDraftFrom}
            max={effectiveDraftTo || undefined}
            onChange={handleFromDateChange}
          />
          <span className="text-sm text-muted">to</span>
          <DateRangeInput
            id="patient-dashboard-to"
            label="To"
            value={effectiveDraftTo}
            min={effectiveDraftFrom || undefined}
            onChange={handleToDateChange}
          />
          <Button
            type="button"
            onClick={applyFilters}
            className="h-[2.625rem] shrink-0 gap-1.5 rounded-xl px-3.5 py-0 text-sm"
            aria-label="Apply filters"
          >
            <Filter className="h-3.5 w-3.5" strokeWidth={2.25} />
            Filter
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={clearDateRange}
            className="h-[2.625rem] shrink-0 rounded-xl px-3.5 py-0 text-sm"
            aria-label="Clear date range"
          >
            Clear
          </Button>
        </div>
      </div>

      {filterError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {filterError}
        </p>
      ) : null}

      <div className="grid items-start gap-4 sm:gap-5 xl:grid-cols-[1.45fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
            <h2 className="text-lg font-semibold text-ink">{tableTitle}</h2>
            <p className="text-sm text-muted">
              {leftLoading ? "Loading…" : `${leftCount} results`}
            </p>
          </div>

          {leftError ? (
            <p className="mx-4 mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:mx-5">
              {leftError}
            </p>
          ) : null}

          {leftLoading ? (
            <div className="space-y-3 px-4 pb-5 sm:px-5">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="h-14 animate-pulse rounded-xl bg-cream/80"
                />
              ))}
            </div>
          ) : leftEmpty ? (
            <EmptyState
              title={
                isAppointmentsTab
                  ? "No upcoming appointments"
                  : "No visits match this filter"
              }
              description={
                isAppointmentsTab
                  ? "Use + to schedule an Urgent Care or Personal Injury appointment."
                  : "Try another category, clear the filter, or adjust the date range."
              }
              className="min-h-64 rounded-none border-0"
            />
          ) : isAppointmentsTab ? (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-[40rem] w-full text-left text-sm">
                  <thead className="border-y border-border/70 bg-cream/50 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                    <tr>
                      <th className="px-4 py-3 sm:px-5">Provider / Location</th>
                      <th className="px-4 py-3 sm:px-5">Type</th>
                      <th className="px-4 py-3 sm:px-5">Date & Time</th>
                      <th className="px-4 py-3 sm:px-5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {upcomingAppointments.map((appointment) => (
                      <tr
                        key={appointment.id}
                        className="bg-white transition hover:bg-cream/40"
                      >
                        <td className="px-4 py-3.5 sm:px-5 sm:py-4">
                          <p className="font-semibold text-ink">
                            {appointment.doctor}
                          </p>
                          <p className="mt-0.5 text-sm text-muted">
                            {appointment.location || "—"}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 sm:px-5 sm:py-4">
                          <Badge
                            className={
                              categoryStyles[appointment.category] ||
                              specialtyStyle(appointment.specialty) ||
                              categoryStyles.Other
                            }
                          >
                            {appointment.category ||
                              appointment.specialty ||
                              appointment.type ||
                              "Appointment"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 sm:px-5 sm:py-4">
                          <p className="font-semibold text-ink">
                            {appointment.date}
                          </p>
                          <p className="mt-0.5 text-sm text-muted">
                            {appointment.time}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 sm:px-5 sm:py-4">
                          <Badge
                            className={
                              appointmentStatusStyles[appointment.status] ||
                              "bg-stone-100 text-stone-600"
                            }
                          >
                            {appointment.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination
                alwaysShow
                page={appointmentPage}
                totalPages={appointmentsTotalPages}
                total={appointmentsTotal}
                start={appointmentStart}
                end={appointmentEnd}
                onChange={setAppointmentPage}
              />
            </>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-[40rem] w-full text-left text-sm">
                  <thead className="border-y border-border/70 bg-cream/50 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                    <tr>
                      <th className="px-4 py-3 sm:px-5">Provider / Location</th>
                      <th className="px-4 py-3 sm:px-5">Category</th>
                      <th className="px-4 py-3 sm:px-5">Date</th>
                      {showWorkStatus ? (
                        <th className="px-4 py-3 sm:px-5">Work Status</th>
                      ) : null}
                      <th className="px-4 py-3 sm:px-5">Documents</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {pagedVisits.items.map((visit) => (
                      <tr
                        key={visit.id}
                        className="cursor-pointer bg-white transition hover:bg-cream/40"
                        onClick={() => openVisitDetail(visit.id)}
                      >
                        <td className="px-4 py-3.5 sm:px-5 sm:py-4">
                          <p className="font-semibold text-ink">
                            {visit.provider}
                          </p>
                          <p className="mt-0.5 text-sm text-muted">
                            {visit.location}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 sm:px-5 sm:py-4">
                          <Badge
                            className={
                              categoryStyles[visit.category] ||
                              categoryStyles.Other
                            }
                          >
                            {visit.category}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 text-ink sm:px-5 sm:py-4">
                          {visit.date}
                        </td>
                        {showWorkStatus ? (
                          <td className="px-4 py-3.5 sm:px-5 sm:py-4">
                            <Badge className={workStatusStyle(visit.workStatus)}>
                              {visit.workStatus}
                            </Badge>
                          </td>
                        ) : null}
                        <td className="px-4 py-3.5 sm:px-5 sm:py-4">
                          <span className="inline-flex items-center gap-2 text-ink">
                            <FileText
                              className="h-4 w-4 text-muted"
                              strokeWidth={1.75}
                            />
                            <span className="font-semibold tabular-nums">
                              {visit.documentCount}
                            </span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination
                alwaysShow
                page={pagedVisits.currentPage}
                totalPages={pagedVisits.totalPages}
                total={pagedVisits.total}
                start={pagedVisits.start}
                end={pagedVisits.end}
                onChange={setVisitPage}
              />
            </>
          )}
        </Card>

        <Card className="flex flex-col overflow-hidden p-0">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-4 py-4 sm:px-5">
            <h2 className="text-lg font-semibold text-ink">
              Upcoming Appointments
            </h2>
            <button
              type="button"
              aria-label="Create appointment"
              onClick={() => setShowCreateAppt(true)}
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-primary text-white transition hover:bg-primary-dark"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>

          {appointmentsError ? (
            <p className="mx-4 my-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:mx-5">
              {appointmentsError}
            </p>
          ) : null}

          {loadingAppointments ? (
            <div className="space-y-3 px-4 py-5 sm:px-5">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="h-16 animate-pulse rounded-xl bg-cream/80"
                />
              ))}
            </div>
          ) : upcomingAppointments.length === 0 ? (
            <EmptyState
              title="No upcoming appointments"
              description="Use + to schedule a new appointment."
              className="min-h-48 rounded-none border-0"
            />
          ) : (
            <>
              <div className="divide-y divide-border/60">
                {upcomingAppointments.map((appointment) => (
                  <div
                    key={appointment.id}
                    className="flex items-end justify-between gap-3 px-4 py-4 transition hover:bg-cream/40 sm:px-5"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-ink">
                          {appointment.doctor}
                        </p>
                        <Badge className={specialtyStyle(appointment.specialty)}>
                          {appointment.specialty}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-ink">{appointment.type}</p>
                      <p className="mt-1 text-sm text-muted">
                        {appointment.date} · {appointment.time}
                      </p>
                    </div>
                    <Badge
                      className={cn(
                        "shrink-0 lowercase",
                        appointment.status === "Confirmed"
                          ? "bg-secondary-100 text-secondary-700"
                          : "bg-amber-50 text-amber-700"
                      )}
                    >
                      {appointment.status}
                    </Badge>
                  </div>
                ))}
              </div>

              <Pagination
                alwaysShow
                page={appointmentPage}
                totalPages={appointmentsTotalPages}
                total={appointmentsTotal}
                start={appointmentStart}
                end={appointmentEnd}
                onChange={setAppointmentPage}
              />
            </>
          )}
        </Card>
      </div>

      <CreatePatientAppointmentModal
        open={showCreateAppt}
        onClose={() => setShowCreateAppt(false)}
        onCreate={handleCreateAppointment}
      />
    </div>
  );
}
