"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DateRangeInput } from "@/components/ui/date-range-input";
import { EmptyState } from "@/components/ui/empty-state";
import { PAGE_SIZE, Pagination, paginateItems } from "@/components/ui/pagination";
import {
  insuranceDashboardSummary,
  privateInsurancePatients,
  unreadInsuranceReports,
  workersCompPatients,
} from "@/data/insurance";
import {
  categoryStyles,
  coverageStyles,
  workStatusStyle,
} from "@/lib/category-styles";
import { cn } from "@/lib/utils";

/**
 * Workers comp patients are claimed through an employer, so that column only
 * exists on the first tab. Everything else is shared across the three tables.
 */
const tabs = [
  {
    key: "workersComp",
    label: "Workers Comp",
    title: "Workers Comp Patients",
    rows: workersCompPatients,
    count: insuranceDashboardSummary.workersComp,
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
    rows: privateInsurancePatients,
    count: insuranceDashboardSummary.privateInsurance,
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
  {
    key: "unreadReports",
    label: "Unread Reports",
    title: "Unread Reports",
    rows: unreadInsuranceReports,
    count: insuranceDashboardSummary.unreadReports,
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
    tabs.some((item) => item.key === tabParam) ? tabParam : tabs[0].key
  );
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);

  const tab = tabs.find((item) => item.key === activeTab) || tabs[0];

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return tab.rows.filter((row) => {
      const date = row[tab.dateKey];
      if (fromDate && date < fromDate) return false;
      if (toDate && date > toDate) return false;

      if (normalized) {
        const haystack = tab.searchKeys
          .map((key) => row[key])
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(normalized)) return false;
      }

      return true;
    });
  }, [fromDate, query, tab, toDate]);

  const paged = paginateItems(filteredRows, page, PAGE_SIZE);

  /** Any filter change invalidates the current page, so send the reader back to the first one. */
  function applyFilter(setter) {
    return (value) => {
      setter(value);
      setPage(1);
    };
  }

  const selectTab = applyFilter(setActiveTab);
  const changeQuery = applyFilter(setQuery);
  const changeFromDate = applyFilter(setFromDate);
  const changeToDate = applyFilter(setToDate);

  return (
    <div className="space-y-4 sm:space-y-5">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        Overview
      </h1>

      <div className="overflow-hidden rounded-2xl bg-primary-800 text-white shadow-sm">
        <div className="grid grid-cols-3">
          {tabs.map((item, index) => {
            const active = item.key === activeTab;

            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={active}
                onClick={() => selectTab(item.key)}
                className={cn(
                  "cursor-pointer px-3 py-4 text-center transition sm:px-4 sm:py-5 lg:px-5",
                  active ? "bg-primary-700" : "hover:bg-white/5",
                  index < tabs.length - 1 && "border-r border-white/10"
                )}
              >
                <p className="text-[10px] font-semibold tracking-[0.12em] text-white/70 uppercase sm:text-[11px] sm:tracking-[0.14em]">
                  {item.label}
                </p>
                <p className="mt-3 font-sans text-4xl leading-none font-semibold tabular-nums sm:text-5xl lg:text-[3.25rem]">
                  {item.count}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2.5 rounded-2xl border border-border/70 bg-white p-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:px-4 sm:py-3">
        <label className="relative block min-w-0 flex-1 sm:min-w-[12rem]">
          <span className="sr-only">Search patient</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            placeholder="Search patient..."
            className="w-full rounded-xl border border-border/80 bg-white py-2.5 pr-4 pl-10 text-sm text-ink outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </label>
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
          <DateRangeInput
            id="insurance-from"
            label="From"
            value={fromDate}
            onChange={(event) => changeFromDate(event.target.value)}
          />
          <span className="text-sm text-muted">to</span>
          <DateRangeInput
            id="insurance-to"
            label="To"
            value={toDate}
            onChange={(event) => changeToDate(event.target.value)}
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-5">
          <h2 className="text-lg font-semibold text-ink">{tab.title}</h2>
          <p className="text-sm text-muted">{filteredRows.length} results</p>
        </div>

        {filteredRows.length === 0 ? (
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
                  {paged.items.map((row) => (
                    <tr
                      key={row.id}
                      onClick={
                        tab.rowsAreLinked
                          ? () => router.push(`/insurance/patients/${row.id}`)
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
