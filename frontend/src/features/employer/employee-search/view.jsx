"use client";

import { Suspense, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, FileText, Filter, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateRangeInput } from "@/components/ui/date-range-input";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PAGE_SIZE, Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmployeeRecordView } from "@/features/employer/employee-search/employee-record-view";
import {
  fetchEmployerEmployeeSearch,
  searchRowToEmployee,
} from "@/lib/api/employer";
import { LOGIN_PATH } from "@/lib/auth-routes";
import { getAccessToken } from "@/lib/auth-session";
import { employerPaths } from "@/lib/portal-paths";
import { reportBadgeStyles } from "@/lib/report-badge-styles";
import { workStatusStyles } from "@/lib/category-styles";

const emptySubscribe = () => () => {};

function formatLocalIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysAgoIso(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return formatLocalIso(date);
}

function todayIso() {
  return formatLocalIso(new Date());
}

function parsePatientId(param) {
  if (!param) return null;
  const raw = String(param).trim();
  if (/^\d+$/.test(raw)) return Number(raw);
  const digits = raw.replace(/^p-/i, "").replace(/^acc-/i, "");
  if (/^\d+$/.test(digits)) return Number(digits);
  return null;
}

const searchTableHeaders = [
  "Patient Name",
  "Account No.",
  "Employer",
  "Insurance",
  "Report Type",
  "Checked-in Date",
  "Incident No.",
  "Date of Injury",
  "Time of Injury",
  "Work Status",
  "AWS Unread Reports",
  "Appointments",
];

function EmployeeSearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const employeeParam =
    searchParams.get("employee") || searchParams.get("employeeId");
  const fromParam = searchParams.get("from");
  const categoryFilter = searchParams.get("category");

  const [draftQuery, setDraftQuery] = useState("");
  const [draftFromDate, setDraftFromDate] = useState(null);
  const [draftToDate, setDraftToDate] = useState(null);
  const [appliedQuery, setAppliedQuery] = useState("");
  const [appliedFromDate, setAppliedFromDate] = useState(null);
  const [appliedToDate, setAppliedToDate] = useState(null);

  const defaultTo = useSyncExternalStore(emptySubscribe, todayIso, () => "");
  const defaultFrom = useSyncExternalStore(
    emptySubscribe,
    () => daysAgoIso(30),
    () => ""
  );
  const rangeReady = Boolean(defaultFrom && defaultTo);
  const effectiveDraftFrom = draftFromDate ?? defaultFrom;
  const effectiveDraftTo = draftToDate ?? defaultTo;
  const effectiveAppliedFrom = appliedFromDate ?? defaultFrom;
  const effectiveAppliedTo = appliedToDate ?? defaultTo;

  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(Boolean(employeeParam));

  const loadEmployees = useCallback(async () => {
    if (!rangeReady || !effectiveAppliedFrom || !effectiveAppliedTo) return;

    const token = getAccessToken();
    if (!token) {
      router.replace(LOGIN_PATH);
      return;
    }

    setLoading(true);
    setLoadError("");

    try {
      const category =
        categoryFilter === "Injury"
          ? "injury"
          : categoryFilter === "Physical"
            ? "physicals"
            : categoryFilter === "Drug Screen"
              ? "drugscreens"
              : undefined;

      const data = await fetchEmployerEmployeeSearch(token, {
        fromDate: effectiveAppliedFrom,
        toDate: effectiveAppliedTo,
        page,
        pageSize: PAGE_SIZE,
        search: appliedQuery || undefined,
        category,
      });
      setRows(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      if (err?.status === 401) {
        router.replace(LOGIN_PATH);
        return;
      }
      setLoadError(err?.message || "Unable to load employees.");
      setRows([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [
    appliedQuery,
    categoryFilter,
    effectiveAppliedFrom,
    effectiveAppliedTo,
    page,
    rangeReady,
    router,
  ]);

  useEffect(() => {
    if (employeeParam) return undefined;
    loadEmployees();
    return undefined;
  }, [employeeParam, loadEmployees]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter]);

  function applyFilters() {
    setAppliedQuery(draftQuery.trim());
    setAppliedFromDate(effectiveDraftFrom);
    setAppliedToDate(effectiveDraftTo);
    setPage(1);
  }

  useEffect(() => {
    if (!employeeParam) {
      setSelectedEmployee(null);
      setLoadingDetail(false);
      return undefined;
    }

    let cancelled = false;

    async function loadDetail() {
      const token = getAccessToken();
      if (!token) {
        router.replace(LOGIN_PATH);
        return;
      }

      setLoadingDetail(true);
      try {
        const patientId = parsePatientId(employeeParam);
        const data = await fetchEmployerEmployeeSearch(token, {
          fromDate: effectiveAppliedFrom,
          toDate: effectiveAppliedTo,
          page: 1,
          pageSize: 1,
          patientId: patientId || undefined,
          search: patientId ? undefined : employeeParam,
        });
        if (cancelled) return;
        const row = data.items[0] || null;
        if (!row) {
          router.replace(
            fromParam === "dashboard"
              ? employerPaths.dashboard
              : employerPaths.employeeSearch
          );
          return;
        }
        setSelectedEmployee(searchRowToEmployee(row));
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 401) {
          router.replace(LOGIN_PATH);
          return;
        }
        router.replace(
          fromParam === "dashboard"
            ? employerPaths.dashboard
            : employerPaths.employeeSearch
        );
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    }

    loadDetail();
    return () => {
      cancelled = true;
    };
  }, [effectiveAppliedFrom, effectiveAppliedTo, employeeParam, fromParam, router]);

  if (employeeParam) {
    const backToDashboard = fromParam === "dashboard";
    const backLabel = backToDashboard
      ? "← Back to dashboard"
      : "← Back to search";
    const onBack = () =>
      router.push(
        backToDashboard
          ? employerPaths.dashboard
          : employerPaths.employeeSearch
      );

    return (
      <EmployeeRecordView
        employee={selectedEmployee}
        loading={loadingDetail || !selectedEmployee}
        backLabel={backLabel}
        onBack={onBack}
      />
    );
  }

  function openEmployee(row) {
    const code = row.patientId || row.employeeId || row.accountNo;
    router.push(
      `${employerPaths.employeeSearch}?employee=${encodeURIComponent(code)}`
    );
  }

  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  return (
    <div>
      <PageHeader title="Employee Search" className="mb-1" />
      <p className="mb-4 text-sm text-muted">
        {loading ? "Loading employees…" : `Showing ${total} results`}
      </p>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <SearchInput
          className="max-w-xl flex-1"
          value={draftQuery}
          onChange={(e) => setDraftQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              applyFilters();
            }
          }}
          placeholder="Search by name, account, or SSN"
          ariaLabel="Search employees"
        />
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <DateRangeInput
            id="employee-search-from"
            label="From"
            value={effectiveDraftFrom}
            onChange={(e) => setDraftFromDate(e.target.value)}
          />
          <span className="text-sm text-muted">to</span>
          <DateRangeInput
            id="employee-search-to"
            label="To"
            value={effectiveDraftTo}
            onChange={(e) => setDraftToDate(e.target.value)}
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

      {loadError ? (
        <Card className="mb-4 border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {loadError}
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        {loading ? (
          <TableSkeleton
            headers={searchTableHeaders}
            rows={PAGE_SIZE}
            minWidthClass="min-w-[72rem]"
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={UserRound}
            title="No employees match your search"
            description="Try a different date range, name, account number, or SSN."
            className="min-h-72 rounded-none border-0"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-[72rem] w-full text-left text-sm">
                <thead className="border-b border-border/70 bg-cream/40 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                  <tr>
                    {searchTableHeaders.map((label) => (
                      <th key={label} className="px-4 py-3">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => openEmployee(row)}
                      className="cursor-pointer bg-white transition hover:bg-cream/40"
                    >
                      <td className="px-4 py-3.5 font-semibold text-ink">
                        {row.employeeName}
                      </td>
                      <td className="px-4 py-3.5 tabular-nums text-muted">
                        {row.accountNo}
                      </td>
                      <td className="px-4 py-3.5 text-ink">{row.employerName}</td>
                      <td className="max-w-[10rem] truncate px-4 py-3.5 text-ink">
                        {row.insuranceCompany}
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge
                          className={
                            reportBadgeStyles[row.reportType] ||
                            "bg-stone-100 text-stone-700"
                          }
                        >
                          {row.reportType}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 text-ink">{row.date}</td>
                      <td className="px-4 py-3.5 tabular-nums text-muted">
                        {row.incidentNumber}
                      </td>
                      <td className="px-4 py-3.5 text-ink">
                        {row.dateOfInjury || "N/A"}
                      </td>
                      <td className="px-4 py-3.5 text-ink">
                        {row.timeOfInjury || "N/A"}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="space-y-1">
                          <Badge
                            className={
                              workStatusStyles[row.workStatus] ||
                              "bg-stone-100 text-stone-600"
                            }
                          >
                            {row.workStatus}
                          </Badge>
                          {row.disabilityStatus &&
                          row.disabilityStatus !== "None" ? (
                            <p className="text-xs text-muted">
                              {row.disabilityStatus}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1.5 tabular-nums text-ink">
                          <FileText className="h-4 w-4 text-muted" />
                          {row.unreadReportCount}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1.5 tabular-nums text-ink">
                          <CalendarDays className="h-4 w-4 text-muted" />
                          {row.appointmentCount}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              alwaysShow
              page={page}
              totalPages={totalPages}
              total={total}
              start={start}
              end={end}
              onChange={setPage}
            />
          </>
        )}
      </Card>
    </div>
  );
}

export function EmployerEmployeeSearchView() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <PageHeader title="Employee Search" className="mb-1" />
          <Card className="overflow-hidden">
            <TableSkeleton
              headers={searchTableHeaders}
              rows={PAGE_SIZE}
              minWidthClass="min-w-[72rem]"
            />
          </Card>
        </div>
      }
    >
      <EmployeeSearchContent />
    </Suspense>
  );
}
