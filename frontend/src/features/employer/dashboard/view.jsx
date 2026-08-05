"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DateRangeInput } from "@/components/ui/date-range-input";
import { EmptyState } from "@/components/ui/empty-state";
import { PAGE_SIZE, Pagination } from "@/components/ui/pagination";
import { KpiSkeletonStrip, TableSkeleton } from "@/components/ui/skeleton";
import { CreateAppointmentModal } from "@/features/employer/dashboard/create-appointment-modal";
import { employerDashboardSummary } from "@/data/employer";
import {
  fetchEmployerDashboardSummary,
  fetchEmployerEmployeeSearch,
  fetchEmployerUpcomingAppointments,
} from "@/lib/api/employer";
import { getAccessToken } from "@/lib/auth-session";
import { LOGIN_PATH } from "@/lib/auth-routes";
import { employerPaths } from "@/lib/portal-paths";
import {
  appointmentStatusStyles,
  categoryStyles,
  workStatusStyles,
} from "@/lib/category-styles";
import { cn } from "@/lib/utils";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(today, days) {
  const date = new Date(`${today}T12:00:00`);
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
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

const emptyCounts = {
  injury: 0,
  physicals: 0,
  drugScreens: 0,
  appointments: 0,
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
  const router = useRouter();
  const today = todayIso();
  const last30From = daysAgoIso(today, 30);

  const [activeFilter, setActiveFilter] = useState(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
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
  const [showCreateAppt, setShowCreateAppt] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(handle);
  }, [query]);

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
    const token = getAccessToken();
    if (!token) {
      router.replace(LOGIN_PATH);
      return;
    }

    const effectiveFrom = fromDate || last30From;
    const effectiveTo = toDate || today;
    const category = serverCategory(activeFilter);

    setLoadingEmployees(true);
    try {
      const data = await fetchEmployerEmployeeSearch(token, {
        fromDate: effectiveFrom,
        toDate: effectiveTo,
        page: employeePage,
        pageSize: PAGE_SIZE,
        search: debouncedQuery || undefined,
        category: category || undefined,
      });
      let items = data.items;
      if (activeFilter === "unreadReports") {
        items = items.filter((row) => (row.unreadReportCount || 0) > 0);
      } else if (activeFilter === "appointments") {
        items = items.filter((row) =>
          appointments.some(
            (appt) =>
              appt.employeeId === row.employeeId ||
              appt.employee === row.employee
          )
        );
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
    appointments,
    debouncedQuery,
    employeePage,
    fromDate,
    last30From,
    router,
    toDate,
    today,
  ]);

  useEffect(() => {
    const handle = setTimeout(() => {
      loadEmployees();
    }, 150);
    return () => clearTimeout(handle);
  }, [loadEmployees]);

  useEffect(() => {
    setEmployeePage(1);
  }, [activeFilter, fromDate, toDate, debouncedQuery]);

  const stats = {
    injury: summaryCounts?.injury ?? 0,
    physicals: summaryCounts?.physicals ?? 0,
    drugScreens: summaryCounts?.drugScreens ?? 0,
    unreadReports: employerDashboardSummary.last30Days.unreadReports,
    appointments: summaryCounts?.appointments ?? apptCount ?? 0,
  };

  function handleKpiClick(filter, openCreate = false) {
    if (openCreate) {
      setShowCreateAppt(true);
      return;
    }

    setActiveFilter((prev) => {
      const next = prev === filter ? null : filter;
      if (next) {
        setFromDate(last30From);
        setToDate(today);
      }
      return next;
    });
    setEmployeePage(1);
  }

  useEffect(() => {
    setAppointmentPage(1);
  }, [appointments.length]);

  const employeeStart =
    employeeTotal === 0 ? 0 : (employeePage - 1) * PAGE_SIZE + 1;
  const employeeEnd = Math.min(employeePage * PAGE_SIZE, employeeTotal);

  const appointmentStart =
    appointmentTotal === 0 ? 0 : (appointmentPage - 1) * PAGE_SIZE + 1;
  const appointmentEnd = Math.min(appointmentPage * PAGE_SIZE, appointmentTotal);

  function handleCreateAppointment(appointment) {
    setAppointments((prev) => [appointment, ...prev]);
    setApptCount((prev) => prev + 1);
    setActiveFilter("appointments");
    setFromDate(last30From);
    setToDate(today);
    setEmployeePage(1);
    setAppointmentPage(1);
  }

  function openEmployeeDetail(row) {
    const code = row.patientId || row.employeeId;
    router.push(
      `${employerPaths.employeeSearch}?employee=${encodeURIComponent(code)}&from=dashboard`
    );
  }

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
                className={cn(
                  "relative cursor-pointer px-3 py-4 text-center transition sm:px-4 sm:py-5 lg:px-5",
                  active ? "bg-primary-700" : "hover:bg-white/5",
                  isTopRowMobile && "border-b border-white/10 lg:border-b-0",
                  isNotLastInRowMobile && "border-r border-white/10 lg:border-r-0",
                  isNotLastDesktop && "lg:border-r lg:border-white/10"
                )}
              >
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
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employee..."
            className="w-full rounded-xl border border-border/80 bg-white py-2.5 pr-4 pl-10 text-sm text-ink outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </label>
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
          <DateRangeInput
            id="dashboard-from"
            label="From"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
          <span className="text-sm text-muted">to</span>
          <DateRangeInput
            id="dashboard-to"
            label="To"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
      </div>

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
              title="No employees match this filter"
              description="Try another KPI, clear the filter, or adjust the date range."
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
