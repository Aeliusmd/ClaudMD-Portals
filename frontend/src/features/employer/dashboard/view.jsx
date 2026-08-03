"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DateRangeInput } from "@/components/ui/date-range-input";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, paginateItems } from "@/components/ui/pagination";
import { CreateAppointmentModal } from "@/features/employer/dashboard/create-appointment-modal";
import {
  EMPLOYER_DEMO_TODAY,
  employerDashboardSummary,
  employees,
  recentActivity,
  upcomingEmployerAppointments,
} from "@/data/employer";
import {
  appointmentStatusStyles,
  categoryStyles,
  workStatusStyles,
} from "@/lib/category-styles";
import { cn } from "@/lib/utils";

const EMPLOYEES_PAGE_SIZE = 5;

function daysAgoIso(todayIso, days) {
  const date = new Date(`${todayIso}T12:00:00`);
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

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
  const last30From = daysAgoIso(EMPLOYER_DEMO_TODAY, 30);

  const [activeFilter, setActiveFilter] = useState(null);
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [appointments, setAppointments] = useState(
    upcomingEmployerAppointments
  );
  const [apptCount, setApptCount] = useState(
    employerDashboardSummary.last30Days.appointments
  );
  const [showCreateAppt, setShowCreateAppt] = useState(false);

  const stats = {
    ...employerDashboardSummary.last30Days,
    appointments: apptCount,
  };

  function handleKpiClick(filter, openCreate = false) {
    if (openCreate) {
      setShowCreateAppt(true);
      return;
    }

    setActiveFilter((prev) => {
      const next = prev === filter ? null : filter;
      if (next === "drugScreens") {
        // Keep drug-screen demo row (Robert, May) visible; not in the Jul window.
        setFromDate("");
        setToDate("");
      } else if (next) {
        setFromDate(last30From);
        setToDate(EMPLOYER_DEMO_TODAY);
      }
      return next;
    });
    setPage(1);
  }

  const employees = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const effectiveFrom = fromDate || null;
    const effectiveTo = toDate || null;

    return recentActivity.filter((row) => {
      if (effectiveFrom && row.lastVisitValue < effectiveFrom) return false;
      if (effectiveTo && row.lastVisitValue > effectiveTo) return false;

      if (activeFilter === "injury" && row.category !== "Injury") return false;
      if (activeFilter === "physicals" && row.category !== "Physical") {
        return false;
      }
      if (activeFilter === "drugScreens" && !row.isDrugScreen) return false;
      if (activeFilter === "unreadReports") {
        // Match KPI “4” as employees that still have unread shared reports
        if (!(row.unreadReportCount > 0)) return false;
      }
      if (activeFilter === "appointments") {
        const hasAppt = appointments.some(
          (appt) =>
            appt.employeeId === row.employeeId ||
            appt.employee === row.employee
        );
        if (!hasAppt) return false;
      }

      if (normalized) {
        const haystack = `${row.employee} ${row.incidentNumber}`.toLowerCase();
        if (!haystack.includes(normalized)) return false;
      }

      return true;
    });
  }, [activeFilter, appointments, fromDate, query, toDate]);

  useEffect(() => {
    setPage(1);
  }, [activeFilter, fromDate, toDate, query]);

  const paged = paginateItems(employees, page, EMPLOYEES_PAGE_SIZE);

  function handleCreateAppointment(appointment) {
    setAppointments((prev) => [appointment, ...prev]);
    setApptCount((prev) => prev + 1);
    setActiveFilter("appointments");
    setFromDate(last30From);
    setToDate(EMPLOYER_DEMO_TODAY);
    setPage(1);
  }

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        Last 30 Days
      </h1>

      <div className="overflow-hidden rounded-2xl bg-navy text-white shadow-sm">
        <div className="grid grid-cols-2 divide-y divide-white/10 sm:grid-cols-5 sm:divide-x sm:divide-y-0">
          {kpiItems.map((item) => {
            const active = activeFilter === item.filter;
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
                  "relative cursor-pointer px-5 py-5 text-left transition",
                  active ? "bg-navy-soft" : "hover:bg-white/5"
                )}
              >
                <p className="text-[11px] font-semibold tracking-[0.14em] text-white/70 uppercase">
                  {item.label}
                </p>
                <div className="mt-2 flex items-end gap-2">
                  <p className="font-sans text-4xl font-semibold tabular-nums leading-none">
                    {stats[item.key]}
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
                      className="mb-1 inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-primary text-white ring-2 ring-white/20"
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-white p-3 lg:flex-row lg:items-center lg:px-4">
        <label className="relative block min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employee..."
            className="w-full rounded-xl border border-border/80 bg-white py-2.5 pr-4 pl-10 text-sm text-ink outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
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

      <div className="grid items-start gap-5 xl:grid-cols-[1.45fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
            <h2 className="text-lg font-semibold text-ink">Employees</h2>
            <p className="text-sm text-muted">{employees.length} results</p>
          </div>

          {employees.length === 0 ? (
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
                      <th className="px-5 py-3">Employee</th>
                      <th className="px-5 py-3">Incident #</th>
                      <th className="px-5 py-3">Category</th>
                      <th className="px-5 py-3">Last Visit</th>
                      <th className="px-5 py-3">Work Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {paged.items.map((row) => (
                      <tr
                        key={row.id}
                        className="cursor-pointer bg-white transition hover:bg-cream/40"
                        onClick={() => {
                          const employee = employees.find(
                            (item) => item.id === row.employeeId
                          );
                          const code =
                            employee?.patientId ||
                            employee?.id ||
                            row.employeeId;
                          router.push(
                            `/employer/employee-search?employee=${encodeURIComponent(code)}`
                          );
                        }}
                      >
                        <td className="px-5 py-4 font-semibold text-ink">
                          {row.employee}
                        </td>
                        <td className="px-5 py-4 tabular-nums text-muted">
                          {row.incidentNumber}
                        </td>
                        <td className="px-5 py-4">
                          <Badge className={categoryStyles[row.category]}>
                            {row.category}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 text-ink">{row.lastVisit}</td>
                        <td className="px-5 py-4">
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
                page={paged.currentPage}
                totalPages={paged.totalPages}
                total={paged.total}
                start={paged.start}
                end={paged.end}
                onChange={setPage}
              />
            </>
          )}
        </Card>

        <Card className="flex max-h-[36rem] flex-col overflow-hidden p-0">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
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

          <div className="min-h-0 flex-1 overflow-y-auto px-5">
            <div className="divide-y divide-border/60">
              {appointments.map((appt) => (
                <div key={appt.id} className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-ink">{appt.employee}</p>
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
          </div>
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
