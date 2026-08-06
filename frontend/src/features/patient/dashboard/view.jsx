"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DateRangeInput } from "@/components/ui/date-range-input";
import { EmptyState } from "@/components/ui/empty-state";
import {
  PAGE_SIZE,
  Pagination,
  paginateItems,
} from "@/components/ui/pagination";
import { CreatePatientAppointmentModal } from "@/features/patient/appointments/create-appointment-modal";
import { unreadReportCount } from "@/features/patient/dashboard/dashboard-utils";
import { appointments as allAppointments } from "@/data/appointments";
import {
  DASHBOARD_APPOINTMENT_WINDOW_DAYS,
  DASHBOARD_VISIT_WINDOW_DAYS,
  PATIENT_DEMO_TODAY,
} from "@/data/patient";
import { visits as allVisits } from "@/data/visits";
import {
  categoryStyles,
  specialtyStyle,
  workStatusStyle,
} from "@/lib/category-styles";
import { isWithinRange, shiftIsoDate, toIsoDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

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
    title: "Visits with Upcoming Appointments",
    showAdd: true,
  },
  /** Read-only counter — it does not filter the table. */
  {
    key: "unreadReports",
    label: "Unread Reports",
    readOnly: true,
  },
];

/** Appointments created in-session have no ISO date, so they always stay visible. */
function isUpcoming(appointment, windowEndIso) {
  if (appointment.status === "Completed") return false;
  const isoDate = toIsoDate(appointment.date);
  if (!isoDate) return true;
  return isoDate >= PATIENT_DEMO_TODAY && isoDate <= windowEndIso;
}

export function PatientDashboardView() {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState("urgentCare");
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [visitPage, setVisitPage] = useState(1);
  const [appointmentPage, setAppointmentPage] = useState(1);
  const [createdAppointments, setCreatedAppointments] = useState([]);
  const [showCreateAppt, setShowCreateAppt] = useState(false);

  const recentVisits = useMemo(() => {
    const windowStart = shiftIsoDate(
      PATIENT_DEMO_TODAY,
      -DASHBOARD_VISIT_WINDOW_DAYS
    );

    return allVisits
      .map((visit) => ({
        ...visit,
        isoDate: toIsoDate(visit.date),
        documentCount: visit.documents?.length || 0,
        unreadCount: unreadReportCount(visit),
      }))
      .filter((visit) => isWithinRange(visit.isoDate, windowStart, PATIENT_DEMO_TODAY));
  }, []);

  const upcomingAppointments = useMemo(() => {
    const windowEnd = shiftIsoDate(
      PATIENT_DEMO_TODAY,
      DASHBOARD_APPOINTMENT_WINDOW_DAYS
    );

    return [
      ...createdAppointments,
      ...allAppointments.filter((appointment) =>
        isUpcoming(appointment, windowEnd)
      ),
    ];
  }, [createdAppointments]);

  const stats = useMemo(() => {
    const byCategory = (category) =>
      recentVisits.filter((visit) => visit.category === category).length;

    return {
      urgentCare: byCategory("Urgent Care"),
      personalInjury: byCategory("Personal Injury"),
      physicals: byCategory("Physical"),
      injury: byCategory("Injury"),
      appointments: upcomingAppointments.length,
      unreadReports: recentVisits.reduce(
        (total, visit) => total + visit.unreadCount,
        0
      ),
    };
  }, [recentVisits, upcomingAppointments]);

  const filteredVisits = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const tab = kpiTabs.find((item) => item.key === activeTab);

    return recentVisits.filter((visit) => {
      if (!isWithinRange(visit.isoDate, fromDate || null, toDate || null)) {
        return false;
      }

      if (tab?.category && visit.category !== tab.category) return false;
      if (activeTab === "appointments") {
        const hasAppointment = upcomingAppointments.some(
          (appointment) => appointment.doctor === visit.provider
        );
        if (!hasAppointment) return false;
      }

      if (normalized) {
        const haystack =
          `${visit.provider} ${visit.location} ${visit.id}`.toLowerCase();
        if (!haystack.includes(normalized)) return false;
      }

      return true;
    });
  }, [activeTab, fromDate, query, recentVisits, toDate, upcomingAppointments]);

  const pagedVisits = paginateItems(filteredVisits, visitPage, PAGE_SIZE);
  const pagedAppointments = paginateItems(
    upcomingAppointments,
    appointmentPage,
    PAGE_SIZE
  );

  const activeTabConfig = kpiTabs.find((item) => item.key === activeTab);
  const tableTitle = activeTabConfig?.title || "All Visits";
  const showWorkStatus = !activeTabConfig?.hideWorkStatus;

  function handleTabClick(key) {
    setActiveTab((prev) => (prev === key ? null : key));
    setVisitPage(1);
  }

  function handleQueryChange(event) {
    setQuery(event.target.value);
    setVisitPage(1);
  }

  function handleFromDateChange(event) {
    setFromDate(event.target.value);
    setVisitPage(1);
  }

  function handleToDateChange(event) {
    setToDate(event.target.value);
    setVisitPage(1);
  }

  function handleCreateAppointment(appointment) {
    setCreatedAppointments((prev) => [appointment, ...prev]);
    setActiveTab("appointments");
    setAppointmentPage(1);
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        Last 30 Days
      </h1>

      <div className="overflow-hidden rounded-2xl bg-primary-800 text-white shadow-sm">
        <div className="grid grid-cols-3 lg:grid-cols-6">
          {kpiTabs.map((item, index) => {
            const active = activeTab === item.key;
            // Mobile/tablet: 3-col grid → two rows of 3; desktop: single row of 6.
            const isTopRowMobile = index < 3;
            const isNotLastInRowMobile = index % 3 !== 2;
            const isNotLastDesktop = index < kpiTabs.length - 1;

            const cellClass = cn(
              "relative px-3 py-4 text-center transition sm:px-4 sm:py-5 lg:px-5",
              item.readOnly
                ? "cursor-default"
                : cn(
                    "cursor-pointer",
                    active ? "bg-primary-700" : "hover:bg-white/5"
                  ),
              isTopRowMobile && "border-b border-white/10 lg:border-b-0",
              isNotLastInRowMobile && "border-r border-white/10 lg:border-r-0",
              isNotLastDesktop && "lg:border-r lg:border-white/10"
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

      <div className="flex flex-col gap-2.5 rounded-2xl border border-border/70 bg-white p-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:px-4 sm:py-3">
        <label className="relative block min-w-0 flex-1 sm:min-w-[12rem]">
          <span className="sr-only">Search visits</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={handleQueryChange}
            placeholder="Search visits by provider, location, or ID..."
            className="w-full rounded-xl border border-border/80 bg-white py-2.5 pr-4 pl-10 text-sm text-ink outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </label>
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
          <DateRangeInput
            id="patient-dashboard-from"
            label="From"
            value={fromDate}
            onChange={handleFromDateChange}
          />
          <span className="text-sm text-muted">to</span>
          <DateRangeInput
            id="patient-dashboard-to"
            label="To"
            value={toDate}
            onChange={handleToDateChange}
          />
        </div>
      </div>

      <div className="grid items-start gap-4 sm:gap-5 xl:grid-cols-[1.45fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
            <h2 className="text-lg font-semibold text-ink">{tableTitle}</h2>
            <p className="text-sm text-muted">
              {filteredVisits.length} results
            </p>
          </div>

          {filteredVisits.length === 0 ? (
            <EmptyState
              title="No visits match this filter"
              description="Try another category, clear the filter, or adjust the date range."
              className="min-h-64 rounded-none border-0"
            />
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
                        onClick={() =>
                          router.push(
                            `/patient/visits/${encodeURIComponent(visit.id)}`
                          )
                        }
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
                          <Badge className={categoryStyles[visit.category]}>
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

          {pagedAppointments.total === 0 ? (
            <EmptyState
              title="No upcoming appointments"
              description="Use + to schedule a new appointment."
              className="min-h-48 rounded-none border-0"
            />
          ) : (
            <>
              <div className="divide-y divide-border/60">
                {pagedAppointments.items.map((appointment) => (
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
                page={pagedAppointments.currentPage}
                totalPages={pagedAppointments.totalPages}
                total={pagedAppointments.total}
                start={pagedAppointments.start}
                end={pagedAppointments.end}
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
