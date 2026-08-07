"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Filter, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateRangeInput } from "@/components/ui/date-range-input";
import { EmptyState } from "@/components/ui/empty-state";
import { PAGE_SIZE, Pagination, paginateItems } from "@/components/ui/pagination";
import { KpiSkeletonStrip, TableSkeleton } from "@/components/ui/skeleton";
import { unreadInsuranceReports } from "@/data/insurance";
import {
  fetchInsuranceDashboardSummary,
  fetchInsurancePatientSearch,
} from "@/lib/api/insurance";
import { getAccessToken } from "@/lib/auth-session";
import { insurancePaths } from "@/lib/portal-paths";
import {
  categoryStyles,
  coverageStyles,
  workStatusStyle,
} from "@/lib/category-styles";
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

/**
 * Workers Comp / Private Insurance patient lists come from live DB.
 * Unread Reports tile remains read-only mock until that list is wired.
 */
const tabDefs = [
  {
    key: "workersComp",
    label: "Workers Comp",
    title: "Workers Comp Patients",
    live: true,
    coverage: "workers_comp",
    countKey: "workersComp",
    dateKey: "lastVisitValue",
    searchKeys: ["patient", "employer", "incidentNumber"],
    emptyDescription: "Try a different search term or widen the date range.",
    rowsAreLinked: true,
    columns: [
      { key: "employer", label: "Employer" },
      { key: "patient", label: "Patient", variant: "strong" },
      { key: "incidentNumber", label: "Incident #", variant: "mono" },
      { key: "category", label: "Category", variant: "category" },
      { key: "lastVisit", label: "Last Visit" },
      { key: "workStatus", label: "Work Status", variant: "workStatus" },
    ],
  },
  {
    key: "privateInsurance",
    label: "Private Insurance",
    title: "Private Insurance Patients",
    live: true,
    coverage: "private",
    countKey: "privateInsurance",
    dateKey: "lastVisitValue",
    searchKeys: ["patient", "claimNumber"],
    emptyDescription: "Try a different search term or widen the date range.",
    rowsAreLinked: true,
    columns: [
      { key: "patient", label: "Patient", variant: "strong" },
      { key: "claimNumber", label: "Claim #", variant: "mono" },
      { key: "category", label: "Category", variant: "category" },
      { key: "lastVisit", label: "Last Visit" },
      { key: "workStatus", label: "Work Status", variant: "workStatus" },
    ],
  },
  /** Read-only counter — the tile does not switch the table. */
  {
    key: "unreadReports",
    label: "Unread Reports",
    title: "Unread Reports",
    readOnly: true,
    rows: unreadInsuranceReports,
    countKey: "unreadReports",
    dateKey: "receivedValue",
    searchKeys: ["patient", "reportType", "provider"],
    emptyDescription: "Try a different search term or widen the date range.",
    columns: [
      { key: "patient", label: "Patient", variant: "strong" },
      { key: "reportType", label: "Report" },
      { key: "coverage", label: "Coverage", variant: "coverage" },
      { key: "provider", label: "Provider" },
      { key: "received", label: "Received" },
    ],
  },
];

const emptySummary = {
  workersComp: 0,
  privateInsurance: 0,
  unreadReports: 0,
};

function Cell({ column, row }) {
  const value = row[column.key];

  if (column.variant === "category") {
    return (
      <Badge className={categoryStyles[value] || "bg-stone-100 text-stone-600"}>
        {value}
      </Badge>
    );
  }

  if (column.variant === "workStatus") {
    return <Badge className={workStatusStyle(value)}>{value}</Badge>;
  }

  if (column.variant === "coverage") {
    return (
      <Badge className={coverageStyles[value] || "bg-stone-100 text-stone-600"}>
        {value}
      </Badge>
    );
  }

  return value;
}

function InsuranceDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  const [activeTab, setActiveTab] = useState(
    tabDefs.some((item) => item.key === tabParam) ? tabParam : tabDefs[0].key
  );
  const [draftQuery, setDraftQuery] = useState("");
  const [draftFromDate, setDraftFromDate] = useState("");
  const [draftToDate, setDraftToDate] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedFromDate, setAppliedFromDate] = useState(null);
  const [appliedToDate, setAppliedToDate] = useState(null);
  const [page, setPage] = useState(1);
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summaryError, setSummaryError] = useState(null);

  const [liveRows, setLiveRows] = useState([]);
  const [liveTotal, setLiveTotal] = useState(0);
  const [liveTotalPages, setLiveTotalPages] = useState(1);
  const [loadingLive, setLoadingLive] = useState(false);
  const [liveError, setLiveError] = useState(null);

  const defaultTo = useSyncExternalStore(
    emptySubscribe,
    () => todayIso(),
    () => ""
  );
  const defaultFrom = useSyncExternalStore(
    emptySubscribe,
    () => daysAgoIso(todayIso(), 30),
    () => ""
  );
  const rangeReady = Boolean(defaultFrom && defaultTo);
  const effectiveDraftFrom = draftFromDate || defaultFrom;
  const effectiveDraftTo = draftToDate || defaultTo;
  const effectiveAppliedFrom = appliedFromDate ?? defaultFrom;
  const effectiveAppliedTo = appliedToDate ?? defaultTo;

  const activeTabDef =
    tabDefs.find((item) => item.key === activeTab) || tabDefs[0];
  const isLiveTab = Boolean(activeTabDef.live);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      const token = getAccessToken();
      if (!token) {
        router.replace(insurancePaths.login);
        return;
      }

      setLoadingSummary(true);
      try {
        const data = await fetchInsuranceDashboardSummary(token);
        if (!cancelled) {
          setSummary(data);
          setSummaryError(null);
        }
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 401) {
          router.replace(insurancePaths.login);
          return;
        }
        setSummaryError(err?.message || "Unable to load dashboard counts.");
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

  const loadLivePatients = useCallback(async () => {
    if (!isLiveTab || !rangeReady || !activeTabDef.coverage) return;

    const token = getAccessToken();
    if (!token) {
      router.replace(insurancePaths.login);
      return;
    }

    setLoadingLive(true);
    try {
      const data = await fetchInsurancePatientSearch(token, {
        fromDate: effectiveAppliedFrom,
        toDate: effectiveAppliedTo,
        page,
        pageSize: PAGE_SIZE,
        search: appliedQuery || undefined,
        coverage: activeTabDef.coverage,
      });
      setLiveRows(data.items);
      setLiveTotal(data.total);
      setLiveTotalPages(data.totalPages);
      setLiveError(null);
    } catch (err) {
      if (err?.status === 401) {
        router.replace(insurancePaths.login);
        return;
      }
      setLiveError(err?.message || "Unable to load patients.");
      setLiveRows([]);
      setLiveTotal(0);
      setLiveTotalPages(1);
    } finally {
      setLoadingLive(false);
    }
  }, [
    activeTabDef.coverage,
    appliedQuery,
    effectiveAppliedFrom,
    effectiveAppliedTo,
    isLiveTab,
    page,
    rangeReady,
    router,
  ]);

  useEffect(() => {
    loadLivePatients();
  }, [loadLivePatients]);

  const counts = summary || emptySummary;
  const tabs = useMemo(
    () =>
      tabDefs.map((item) => ({
        ...item,
        count: counts[item.countKey] ?? 0,
      })),
    [counts]
  );

  const tab = tabs.find((item) => item.key === activeTab) || tabs[0];

  const filteredMockRows = useMemo(() => {
    if (isLiveTab) return [];
    const normalized = appliedQuery.trim().toLowerCase();
    const rows = tab.rows || [];

    return rows.filter((row) => {
      const date = row[tab.dateKey];
      if (effectiveAppliedFrom && date < effectiveAppliedFrom) return false;
      if (effectiveAppliedTo && date > effectiveAppliedTo) return false;

      if (normalized) {
        const haystack = tab.searchKeys
          .map((key) => row[key])
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(normalized)) return false;
      }

      return true;
    });
  }, [
    effectiveAppliedFrom,
    effectiveAppliedTo,
    isLiveTab,
    appliedQuery,
    tab,
  ]);

  const mockPaged = paginateItems(filteredMockRows, page, PAGE_SIZE);

  const tableRows = isLiveTab ? liveRows : mockPaged.items;
  const resultCount = isLiveTab ? liveTotal : filteredMockRows.length;
  const paginationPage = isLiveTab
    ? Math.min(page, liveTotalPages)
    : mockPaged.currentPage;
  const paginationTotalPages = isLiveTab ? liveTotalPages : mockPaged.totalPages;
  const paginationStart = isLiveTab
    ? liveTotal === 0
      ? 0
      : (paginationPage - 1) * PAGE_SIZE + 1
    : mockPaged.start;
  const paginationEnd = isLiveTab
    ? Math.min(paginationPage * PAGE_SIZE, liveTotal)
    : mockPaged.end;

  function applyFilters() {
    setAppliedQuery(draftQuery.trim());
    setAppliedFromDate(effectiveDraftFrom);
    setAppliedToDate(effectiveDraftTo);
    setPage(1);
  }

  function selectTab(key) {
    setActiveTab(key);
    setPage(1);
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
        <KpiSkeletonStrip count={3} />
      ) : (
        <div className="overflow-hidden rounded-2xl bg-primary-800 text-white shadow-sm">
          <div className="grid grid-cols-3">
            {tabs.map((item, index) => {
              const active = item.key === activeTab;

              const cellClass = cn(
                "px-3 py-4 text-center transition sm:px-4 sm:py-5 lg:px-5",
                item.readOnly
                  ? "cursor-default"
                  : cn(
                      "cursor-pointer",
                      active ? "bg-primary-700" : "hover:bg-white/5"
                    ),
                index < tabs.length - 1 && "border-r border-white/10"
              );

              const cellContent = (
                <>
                  <p className="text-[10px] font-semibold tracking-[0.12em] text-white/70 uppercase sm:text-[11px] sm:tracking-[0.14em]">
                    {item.label}
                  </p>
                  <p className="mt-3 font-sans text-4xl leading-none font-semibold tabular-nums sm:text-5xl lg:text-[3.25rem]">
                    {item.count}
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
                  aria-pressed={active}
                  onClick={() => selectTab(item.key)}
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
          <span className="sr-only">Search patient</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={draftQuery}
            onChange={(event) => setDraftQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyFilters();
              }
            }}
            placeholder="Search patient..."
            className="w-full rounded-xl border border-border/80 bg-white py-2.5 pr-4 pl-10 text-sm text-ink outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </label>
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
          <DateRangeInput
            id="insurance-from"
            label="From"
            value={effectiveDraftFrom}
            onChange={(event) => setDraftFromDate(event.target.value)}
          />
          <span className="text-sm text-muted">to</span>
          <DateRangeInput
            id="insurance-to"
            label="To"
            value={effectiveDraftTo}
            onChange={(event) => setDraftToDate(event.target.value)}
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
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
          <h2 className="text-lg font-semibold text-ink">{tab.title}</h2>
          <p className="text-sm text-muted">{resultCount} results</p>
        </div>

        {liveError && isLiveTab ? (
          <p className="mx-4 mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 sm:mx-5">
            {liveError}
          </p>
        ) : null}

        {isLiveTab && loadingLive ? (
          <TableSkeleton
            rows={5}
            columns={tab.columns?.length || 5}
          />
        ) : resultCount === 0 ? (
          <EmptyState
            title={`No ${tab.title.toLowerCase()} match this filter`}
            description={tab.emptyDescription}
            className="min-h-64 rounded-none border-0"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] text-left text-sm">
                <thead className="border-y border-border/70 bg-cream/50 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                  <tr>
                    {tab.columns.map((column) => (
                      <th key={column.key} className="px-4 py-3 sm:px-5">
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {tableRows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={
                        tab.rowsAreLinked
                          ? () => {
                              const coverageQs = tab.coverage
                                ? `?coverage=${encodeURIComponent(tab.coverage)}`
                                : "";
                              router.push(
                                `/insurance/patients/${encodeURIComponent(row.id)}${coverageQs}`
                              );
                            }
                          : undefined
                      }
                      className={cn(
                        "bg-white transition hover:bg-cream/40",
                        tab.rowsAreLinked && "cursor-pointer"
                      )}
                    >
                      {tab.columns.map((column) => (
                        <td
                          key={column.key}
                          className={cn(
                            "px-4 py-3.5 text-ink sm:px-5 sm:py-4",
                            column.variant === "strong" && "font-semibold",
                            column.variant === "mono" &&
                              "tabular-nums text-muted"
                          )}
                        >
                          <Cell column={column} row={row} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={paginationPage}
              totalPages={paginationTotalPages}
              total={resultCount}
              start={paginationStart}
              end={paginationEnd}
              onChange={setPage}
            />
          </>
        )}
      </Card>
    </div>
  );
}

export function InsuranceDashboardView() {
  return (
    <Suspense
      fallback={<div className="text-sm text-muted">Loading dashboard…</div>}
    >
      <InsuranceDashboardContent />
    </Suspense>
  );
}
