"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateRangeInput } from "@/components/ui/date-range-input";
import { EmptyState } from "@/components/ui/empty-state";
import { PAGE_SIZE, Pagination } from "@/components/ui/pagination";
import { KpiSkeletonStrip, TableSkeleton } from "@/components/ui/skeleton";
import { CreateAppointmentModal } from "@/features/employer/dashboard/create-appointment-modal";
import {
  fetchEmployerDashboardSummary,
  fetchEmployerEmployeeSearch,
  fetchEmployerUpcomingAppointments,
} from "@/lib/api/employer";
import { getAccessToken } from "@/lib/auth-session";
import { LOGIN_PATH } from "@/lib/auth-routes";
import {
  buildDashboardStateParams,
  hrefWithParams,
  parseDashboardStateParams,
  withReturnParams,
} from "@/lib/dashboard-return-state";
import { employerPaths } from "@/lib/portal-paths";
import {
  appointmentStatusStyles,
  categoryStyles,
  workStatusStyles,
} from "@/lib/category-styles";
import {
  coerceToDate,
  DATE_RANGE_ERROR,
  isInvalidDateRange,
} from "@/lib/date-range";
import { searchQueryError } from "@/lib/text-validation";
import { cn } from "@/lib/utils";

const emptySubscribe = () => () => {};
function formatLocalIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayIso() {
  return formatLocalIso(new Date());
}

function daysAgoIso(today, days) {
  const date = new Date(`${today}T12:00:00`);
  date.setDate(date.getDate() - days);
  return formatLocalIso(date);
}

function formatVisitLabel(isoOrLabel) {
  if (!isoOrLabel) return "—";
  if (/^\d{4}-\d{2}-\d{2}/.test(isoOrLabel)) {
    const date = new Date(`${isoOrLabel.slice(0, 10)}T12:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
  }
  return isoOrLabel;
}

function serverCategory(filter) {
  if (filter === "injury") return "injury";
  if (filter === "physicals") return "physicals";
  if (filter === "drugScreens") return "drugscreens";
  return null;
}

function mapAppointmentToEmployeeRow(appt) {
  return {
    id: appt.id,
    employee: appt.employee,
    employeeName: appt.employee,
    employeeId: String(appt.patientId || appt.employeeId || ""),
    patientId: appt.patientId,
    incidentNumber: "—",
    category: appt.category || "Injury",
    lastVisit: appt.date,
    lastVisitValue: appt.dateValue,
    workStatus: appt.status || "Scheduled",
  };
}

const emptyCounts = {
  injury: 0,
  physicals: 0,
  drugScreens: 0,
  appointments: 0,
  unreadReports: 0,
};

const employeeTableHeaders = [
  "Employee",
  "Incident #",
  "Category",
  "Last Visit",
  "Work Status",
];

const kpiItems = [
  { key: "injury", label: "Injury", filter: "injury" },
  { key: "physicals", label: "Physicals", filter: "physicals" },
  { key: "drugScreens", label: "Drug Screens", filter: "drugScreens" },
  {
    key: "appointments",
    label: "Appointments",
    filter: "appointments",
    showAdd: true,
  },
  {
    key: "unreadReports",
    label: "Unread Reports",
    filter: "unreadReports",
  },
];

export function EmployerDashboardView() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 sm:space-y-5">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Last 30 Days
          </h1>
          <KpiSkeletonStrip count={5} />
        </div>
      }
    >
      <EmployerDashboardContent />
    </Suspense>
  );
}

function EmployerDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = parseDashboardStateParams(searchParams);

  // Client-only defaults (server snapshot is empty) avoid timezone hydration mismatches.
  const defaultTo = useSyncExternalStore(emptySubscribe, todayIso, () => "");
  const defaultFrom = useSyncExternalStore(
    emptySubscribe,
    () => daysAgoIso(todayIso(), 30),
    () => ""
  );
  const rangeReady = Boolean(defaultFrom && defaultTo);

  const validFilters = new Set([
    "injury",
    "physicals",
    "drugScreens",
    "appointments",
    "unreadReports",
  ]);
  const initialFilter =
    initial.filter && validFilters.has(initial.filter) ? initial.filter : null;

  const [activeFilter, setActiveFilter] = useState(initialFilter);

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

  const [employeePage, setEmployeePage] = useState(1);
  const [employeeTotal, setEmployeeTotal] = useState(0);
  const [employeeTotalPages, setEmployeeTotalPages] = useState(1);
  const [appointmentPage, setAppointmentPage] = useState(1);
  const [appointments, setAppointments] = useState([]);
  const [appointmentTotal, setAppointmentTotal] = useState(0);
  const [appointmentTotalPages, setAppointmentTotalPages] = useState(1);
  const [loadingAppointments, setLoadingAppointments] = useState(true);
  const [apptCount, setApptCount] = useState(0);
  const [summaryCounts, setSummaryCounts] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [filterError, setFilterError] = useState(null);
  const [showCreateAppt, setShowCreateAppt] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      const token = getAccessToken();
      if (!token) {
        router.replace(LOGIN_PATH);
        return;
      }

      setLoadingSummary(true);
      try {
        const data = await fetchEmployerDashboardSummary(token);
        if (!cancelled) {
          setSummaryCounts({
            injury: data.injury,
            physicals: data.physicals,
            drugScreens: data.drugScreens,
            appointments: data.appointments,
            unreadReports: data.unreadReports ?? 0,
          });
          setApptCount(data.appointments ?? 0);
        }
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 401) {
          router.replace(LOGIN_PATH);
          return;
        }
        setLoadError(err?.message || "Unable to load dashboard.");
        setSummaryCounts(emptyCounts);
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

    async function loadAppointments() {
      const token = getAccessToken();
      if (!token) {
        router.replace(LOGIN_PATH);
        return;
      }

      setLoadingAppointments(true);
      try {
        const data = await fetchEmployerUpcomingAppointments(token, {
          page: appointmentPage,
          pageSize: PAGE_SIZE,
        });
        if (!cancelled) {
          setAppointments(data.items);
          setAppointmentTotal(data.total);
          setAppointmentTotalPages(data.totalPages);
          setApptCount(data.total ?? 0);
          setSummaryCounts((prev) =>
            prev ? { ...prev, appointments: data.total ?? 0 } : prev
          );
        }
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 401) {
          router.replace(LOGIN_PATH);
          return;
        }
        setAppointments([]);
        setAppointmentTotal(0);
        setAppointmentTotalPages(1);
      } finally {
        if (!cancelled) setLoadingAppointments(false);
      }
    }

    loadAppointments();

    return () => {
      cancelled = true;
    };
  }, [appointmentPage, router]);

  const loadEmployees = useCallback(async () => {
    if (
      activeFilter !== "appointments" &&
      (!rangeReady || !effectiveAppliedFrom || !effectiveAppliedTo)
    ) {
      return;
    }

    const token = getAccessToken();
    if (!token) {
      router.replace(LOGIN_PATH);
      return;
    }

    const category = serverCategory(activeFilter);

    setLoadingEmployees(true);
    try {
      if (activeFilter === "appointments") {
        const data = await fetchEmployerUpcomingAppointments(token, {
          page: employeePage,
          pageSize: PAGE_SIZE,
        });
        let items = data.items.map(mapAppointmentToEmployeeRow);
        if (appliedQuery) {
          const query = appliedQuery.toLowerCase();
          items = items.filter((row) =>
            (row.employee || row.employeeName || "").toLowerCase().includes(query)
          );
        }
        setEmployees(items);
        setEmployeeTotal(data.total);
        setEmployeeTotalPages(data.totalPages);
        setLoadError(null);
        return;
      }

      const data = await fetchEmployerEmployeeSearch(token, {
        fromDate: effectiveAppliedFrom,
        toDate: effectiveAppliedTo,
        page: employeePage,
        pageSize: PAGE_SIZE,
        search: appliedQuery || undefined,
        category: category || undefined,
      });
      let items = data.items;
      if (activeFilter === "unreadReports") {
        items = items.filter((row) => (row.unreadReportCount || 0) > 0);
      }
      setEmployees(items);
      setEmployeeTotal(data.total);
      setEmployeeTotalPages(data.totalPages);
      setLoadError(null);
    } catch (err) {
      if (err?.status === 401) {
        router.replace(LOGIN_PATH);
        return;
      }
      setLoadError(err?.message || "Unable to load employees.");
      setEmployees([]);
      setEmployeeTotal(0);
      setEmployeeTotalPages(1);
    } finally {
      setLoadingEmployees(false);
    }
  }, [
    activeFilter,
    appliedQuery,
    effectiveAppliedFrom,
    effectiveAppliedTo,
    employeePage,
    rangeReady,
    router,
  ]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

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
    setEmployeePage(1);
  }

  function clearDateRange() {
    setDraftFromDate(null);
    setDraftToDate(null);
    setAppliedFromDate(null);
    setAppliedToDate(null);
    setDraftQuery("");
    setAppliedQuery("");
    setFilterError(null);
    setEmployeePage(1);
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
    const nextTo = event.target.value;
    setDraftToDate(coerceToDate(effectiveDraftFrom, nextTo));
    setFilterError(null);
  }

  const stats = {
    injury: summaryCounts?.injury ?? 0,
    physicals: summaryCounts?.physicals ?? 0,
    drugScreens: summaryCounts?.drugScreens ?? 0,
    unreadReports: summaryCounts?.unreadReports ?? 0,
    // Live upcoming appointments (same source as the Upcoming Appointments list).
    appointments: appointmentTotal || summaryCounts?.appointments || apptCount || 0,
  };

  function handleKpiClick(filter, openCreate = false) {
    if (openCreate) {
      setShowCreateAppt(true);
      return;
    }

    setActiveFilter((prev) => {
      const next = prev === filter ? null : filter;
      // KPI clicks apply last-30-days immediately (Injury / Physicals / Drug Screens)
      setDraftFromDate(null);
      setDraftToDate(null);
      setAppliedFromDate(null);
      setAppliedToDate(null);
      return next;
    });
    setEmployeePage(1);
  }

  const employeeStart =
    employeeTotal === 0 ? 0 : (employeePage - 1) * PAGE_SIZE + 1;
  const employeeEnd = Math.min(employeePage * PAGE_SIZE, employeeTotal);

  const appointmentStart =
    appointmentTotal === 0 ? 0 : (appointmentPage - 1) * PAGE_SIZE + 1;
  const appointmentEnd = Math.min(appointmentPage * PAGE_SIZE, appointmentTotal);

  async function handleCreateAppointment(appointment) {
    setAppointments((prev) => [appointment, ...prev]);
    setApptCount((prev) => prev + 1);
    setActiveFilter("appointments");
    setDraftFromDate(null);
    setDraftToDate(null);
    setAppliedFromDate(null);
    setAppliedToDate(null);
    setEmployeePage(1);
    setAppointmentPage(1);

    const token = getAccessToken();
    if (!token) return;
    try {
      const [upcoming, summary] = await Promise.all([
        fetchEmployerUpcomingAppointments(token, {
          page: 1,
          pageSize: PAGE_SIZE,
        }),
        fetchEmployerDashboardSummary(token),
      ]);
      setAppointments(upcoming.items);
      setAppointmentTotal(upcoming.total);
      setAppointmentTotalPages(upcoming.totalPages);
      setSummaryCounts({
        injury: summary.injury,
        physicals: summary.physicals,
        drugScreens: summary.drugScreens,
        appointments: summary.appointments,
        unreadReports: summary.unreadReports ?? 0,
      });
      setApptCount(summary.appointments ?? 0);
    } catch {
      // Keep optimistic row if refresh fails.
    }
  }

  function openEmployeeDetail(row) {
    const code = row.patientId ?? row.employeeId;
    if (code == null || code === "") return;
    const params = new URLSearchParams();
    params.set("employee", String(code));
    params.set("from", "dashboard");
    if (effectiveAppliedFrom) params.set("fromDate", effectiveAppliedFrom);
    if (effectiveAppliedTo) params.set("toDate", effectiveAppliedTo);
    const category = serverCategory(activeFilter);
    if (category) params.set("category", category);
    const returnParams = buildDashboardStateParams({
      filter: activeFilter,
      search: appliedQuery,
      fromDate: effectiveAppliedFrom,
      toDate: effectiveAppliedTo,
    });
    withReturnParams(params, returnParams);
    router.push(`${employerPaths.employeeSearch}?${params.toString()}`);
  }

  useEffect(() => {
    const next = buildDashboardStateParams({
      filter: activeFilter,
      search: appliedQuery,
      fromDate: effectiveAppliedFrom,
      toDate: effectiveAppliedTo,
    });
    const nextQs = next.toString();
    const currentQs = buildDashboardStateParams(
      parseDashboardStateParams(searchParams)
    ).toString();
    if (nextQs !== currentQs) {
      router.replace(hrefWithParams(employerPaths.dashboard, next), {
        scroll: false,
      });
    }
  }, [
    activeFilter,
    appliedQuery,
    effectiveAppliedFrom,
    effectiveAppliedTo,
    router,
    searchParams,
  ]);

  return (
    <div className="space-y-4 sm:space-y-5">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        Last 30 Days
      </h1>

      {loadingSummary || !summaryCounts ? (
        <KpiSkeletonStrip count={kpiItems.length} />
      ) : (
      <div className="overflow-hidden rounded-2xl bg-primary-800 text-white shadow-sm">
        <div className="grid grid-cols-3 lg:grid-cols-5">
          {kpiItems.map((item, index) => {
            const active = activeFilter === item.filter;
            const isTopRowMobile = index < 3;
            const isNotLastInRowMobile = index % 3 !== 2;
            const isNotLastDesktop = index < kpiItems.length - 1;
            const clickable = item.filter !== "unreadReports";
            const cellClassName = cn(
              "relative px-3 py-4 text-center transition sm:px-4 sm:py-5 lg:px-5",
              clickable && "cursor-pointer",
              clickable && active ? "bg-primary-700" : null,
              clickable && !active ? "hover:bg-white/5" : null,
              !clickable && "cursor-default",
              isTopRowMobile && "border-b border-white/10 lg:border-b-0",
              isNotLastInRowMobile && "border-r border-white/10 lg:border-r-0",
              isNotLastDesktop && "lg:border-r lg:border-white/10"
            );

            const content = (
              <>
                <div className="flex items-center justify-center gap-1.5">
                  <p className="text-[10px] font-semibold tracking-[0.12em] text-white/70 uppercase sm:text-[11px] sm:tracking-[0.14em]">
                    {item.label}
                  </p>
                  {item.showAdd ? (
                    <span
                      data-kpi-add
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
                  {stats[item.key] ?? 0}
                </p>
              </>
            );

            if (!clickable) {
              return (
                <div
                  key={item.key}
                  className={cellClassName}
                  aria-label={`${item.label}: ${stats[item.key] ?? 0}`}
                >
                  {content}
                </div>
              );
            }

            return (
              <button
                key={item.key}
                type="button"
                onClick={(event) => {
                  if (item.showAdd && event.target.closest("[data-kpi-add]")) {
                    handleKpiClick(item.filter, true);
                    return;
                  }
                  handleKpiClick(item.filter, false);
                }}
                className={cellClassName}
              >
                {content}
              </button>
            );
          })}
        </div>
      </div>
      )}

      <div className="flex flex-col gap-2.5 rounded-2xl border border-border/70 bg-white p-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:px-4 sm:py-3">
        <label className="relative block min-w-0 flex-1 sm:min-w-[12rem]">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={draftQuery}
            onChange={handleSearchChange}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyFilters();
              }
            }}
            placeholder="Search employee..."
            className="w-full rounded-xl border border-border/80 bg-white py-2.5 pr-4 pl-10 text-sm text-ink outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </label>
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
          <DateRangeInput
            id="dashboard-from"
            label="From"
            value={effectiveDraftFrom}
            max={effectiveDraftTo || undefined}
            onChange={handleFromDateChange}
          />
          <span className="text-sm text-muted">to</span>
          <DateRangeInput
            id="dashboard-to"
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

      {loadError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {loadError}
        </p>
      ) : null}

      <div className="grid items-start gap-4 sm:gap-5 xl:grid-cols-[1.45fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
            <h2 className="text-lg font-semibold text-ink">Employees</h2>
            <p className="text-sm text-muted">
              {loadingEmployees
                ? "Loading…"
                : `${employeeTotal} results`}
            </p>
          </div>

          {loadingEmployees ? (
            <TableSkeleton
              headers={employeeTableHeaders}
              rows={PAGE_SIZE}
              minWidthClass="min-w-[40rem]"
            />
          ) : employees.length === 0 ? (
            <EmptyState
              title={
                activeFilter === "appointments"
                  ? "No upcoming appointments"
                  : "No employees match this filter"
              }
              description={
                activeFilter === "appointments"
                  ? "There are no scheduled appointments from today onward for this employer."
                  : "Try another KPI, clear the filter, or adjust the date range."
              }
              className="min-h-64 rounded-none border-0"
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-[40rem] w-full text-left text-sm">
                  <thead className="border-y border-border/70 bg-cream/50 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                    <tr>
                      <th className="px-4 py-3 sm:px-5">Employee</th>
                      <th className="px-4 py-3 sm:px-5">Incident #</th>
                      <th className="px-4 py-3 sm:px-5">Category</th>
                      <th className="px-4 py-3 sm:px-5">Last Visit</th>
                      <th className="px-4 py-3 sm:px-5">Work Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {employees.map((row) => (
                      <tr
                        key={row.id}
                        className="cursor-pointer bg-white transition hover:bg-cream/40"
                        onClick={() => openEmployeeDetail(row)}
                      >
                        <td className="px-4 py-3.5 font-semibold text-ink sm:px-5 sm:py-4">
                          {row.employee || row.employeeName}
                        </td>
                        <td className="px-4 py-3.5 tabular-nums text-muted sm:px-5 sm:py-4">
                          {row.incidentNumber}
                        </td>
                        <td className="px-4 py-3.5 sm:px-5 sm:py-4">
                          <Badge
                            className={
                              categoryStyles[row.category] ||
                              "bg-stone-100 text-stone-600"
                            }
                          >
                            {row.category}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 text-ink sm:px-5 sm:py-4">
                          {formatVisitLabel(row.lastVisitValue || row.lastVisit)}
                        </td>
                        <td className="px-4 py-3.5 sm:px-5 sm:py-4">
                          <Badge
                            className={
                              workStatusStyles[row.workStatus] ||
                              "bg-stone-100 text-stone-600"
                            }
                          >
                            {row.workStatus}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination
                alwaysShow
                page={employeePage}
                totalPages={employeeTotalPages}
                total={employeeTotal}
                start={employeeStart}
                end={employeeEnd}
                onChange={setEmployeePage}
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

          {loadingAppointments ? (
            <div className="flex min-h-48 items-center justify-center text-sm text-muted">
              Loading appointments…
            </div>
          ) : appointmentTotal === 0 ? (
            <EmptyState
              title="No upcoming appointments"
              description="There are no scheduled appointments from today onward for this employer."
              className="min-h-48 rounded-none border-0"
            />
          ) : (
            <>
              <div className="divide-y divide-border/60">
                {appointments.map((appt) => (
                  <div
                    key={appt.id}
                    className="px-4 py-4 transition hover:bg-cream/40 sm:px-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-ink">
                            {appt.employee}
                          </p>
                          <Badge className={categoryStyles[appt.category]}>
                            {appt.category}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-ink">
                          {appt.visitType || appt.type}
                        </p>
                        <p className="mt-1 text-sm text-muted">
                          {appt.date} · {appt.time}
                        </p>
                      </div>
                      <Badge
                        className={cn(
                          "shrink-0",
                          appointmentStatusStyles[appt.status] ||
                            "bg-stone-100 text-stone-600"
                        )}
                      >
                        {appt.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>

              <Pagination
                alwaysShow
                page={appointmentPage}
                totalPages={appointmentTotalPages}
                total={appointmentTotal}
                start={appointmentStart}
                end={appointmentEnd}
                onChange={setAppointmentPage}
              />
            </>
          )}
        </Card>
      </div>

      <CreateAppointmentModal
        open={showCreateAppt}
        onClose={() => setShowCreateAppt(false)}
        onCreate={handleCreateAppointment}
      />
    </div>
  );
}
