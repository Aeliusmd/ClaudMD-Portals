"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, FileText, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DateRangeInput } from "@/components/ui/date-range-input";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { EmployeeRecordView } from "@/features/employer/employee-search/employee-record-view";
import { matchesEmployeeSearch } from "@/features/employer/employee-search/search-utils";
import {
  fetchEmployerEmployeeSearch,
  searchRowToEmployee,
} from "@/lib/api/employer";
import { LOGIN_PATH } from "@/lib/auth-routes";
import { getAccessToken } from "@/lib/auth-session";
import { reportBadgeStyles } from "@/lib/report-badge-styles";
import { workStatusStyles } from "@/lib/category-styles";
import { cn } from "@/lib/utils";

function daysAgoIso(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function findEmployeeFromRows(rows, param) {
  if (!param) return null;
  const normalized = param.trim().toLowerCase();
  const row = rows.find(
    (entry) =>
      String(entry.patientId) === normalized ||
      String(entry.employeeId).toLowerCase() === normalized ||
      String(entry.accountNo || "").toLowerCase() === normalized ||
      `p-${String(entry.accountNo || "").toLowerCase()}` === normalized
  );
  return row ? searchRowToEmployee(row) : null;
}

function EmployeeSearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const employeeParam =
    searchParams.get("employee") || searchParams.get("employeeId");
  const fromParam = searchParams.get("from");
  const categoryFilter = searchParams.get("category");

  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState(daysAgoIso(30));
  const [toDate, setToDate] = useState(todayIso());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadEmployees() {
      const token = getAccessToken();
      if (!token) {
        router.replace(LOGIN_PATH);
        return;
      }

      setLoading(true);
      setLoadError("");

      try {
        const data = await fetchEmployerEmployeeSearch(token, {
          fromDate,
          toDate,
        });
        if (!cancelled) {
          setRows(data.items);
        }
      } catch (err) {
        if (!cancelled) {
          if (err?.status === 401) {
            router.replace(LOGIN_PATH);
            return;
          }
          setLoadError(err?.message || "Unable to load employees.");
          setRows([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadEmployees();

    return () => {
      cancelled = true;
    };
  }, [fromDate, toDate, router]);

  const selectedEmployee = useMemo(
    () => findEmployeeFromRows(rows, employeeParam),
    [employeeParam, rows]
  );

  const filteredRows = useMemo(() => {
    return rows.filter((entry) => {
      if (categoryFilter === "Injury" || categoryFilter === "Physical") {
        if (entry.category !== categoryFilter) return false;
      }
      return matchesEmployeeSearch(entry, query);
    });
  }, [categoryFilter, query, rows]);

  useEffect(() => {
    if (employeeParam && !loading && !selectedEmployee) {
      router.replace(
        fromParam === "dashboard"
          ? "/employer/dashboard"
          : "/employer/employee-search"
      );
    }
  }, [employeeParam, selectedEmployee, router, fromParam, loading]);

  if (selectedEmployee) {
    const backToDashboard = fromParam === "dashboard";
    return (
      <EmployeeRecordView
        employee={selectedEmployee}
        backLabel={backToDashboard ? "← Back to dashboard" : "← Back to search"}
        onBack={() =>
          router.push(
            backToDashboard
              ? "/employer/dashboard"
              : "/employer/employee-search"
          )
        }
      />
    );
  }

  function openEmployee(row) {
    const code = row.accountNo || row.employeeId || row.patientId;
    router.push(`/employer/employee-search?employee=${encodeURIComponent(code)}`);
  }

  return (
    <div>
      <PageHeader title="Employee Search" className="mb-1" />
      <p className="mb-4 text-sm text-muted">
        {loading
          ? "Loading employees…"
          : `Showing ${filteredRows.length} results`}
      </p>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <SearchInput
          className="max-w-xl flex-1"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, account, or SSN"
          ariaLabel="Search employees"
        />
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <DateRangeInput
            id="employee-search-from"
            label="From"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
          <span className="text-sm text-muted">to</span>
          <DateRangeInput
            id="employee-search-to"
            label="To"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
      </div>

      {loadError ? (
        <Card className="mb-4 border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {loadError}
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex min-h-72 items-center justify-center text-sm text-muted">
            Loading employee records…
          </div>
        ) : filteredRows.length === 0 ? (
          <EmptyState
            icon={UserRound}
            title="No employees match your search"
            description="Try a different date range, name, account number, or SSN."
            className="min-h-72 rounded-none border-0"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[72rem] w-full text-left text-sm">
              <thead className="border-b border-border/70 bg-cream/40 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                <tr>
                  <th className="px-4 py-3">Patient Name</th>
                  <th className="px-4 py-3">Account No.</th>
                  <th className="px-4 py-3">Employer</th>
                  <th className="px-4 py-3">Insurance</th>
                  <th className="px-4 py-3">Report Type</th>
                  <th className="px-4 py-3">Checked-in Date</th>
                  <th className="px-4 py-3">Incident No.</th>
                  <th className="px-4 py-3">Date of Injury</th>
                  <th className="px-4 py-3">Time of Injury</th>
                  <th className="px-4 py-3">Work Status</th>
                  <th className="px-4 py-3">AWS Unread Reports</th>
                  <th className="px-4 py-3">Appointments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredRows.map((row) => (
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
        )}
      </Card>
    </div>
  );
}

export function EmployerEmployeeSearchView() {
  return (
    <Suspense
      fallback={
        <div className="text-sm text-muted">Loading employee search…</div>
      }
    >
      <EmployeeSearchContent />
    </Suspense>
  );
}
