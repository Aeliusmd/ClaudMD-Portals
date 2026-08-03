"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, FileText, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { EmployeeRecordView } from "@/features/employer/employee-search/employee-record-view";
import { matchesEmployeeSearch } from "@/features/employer/employee-search/search-utils";
import { employeeSearchEntries, employees } from "@/data/employer";
import { reportBadgeStyles } from "@/lib/report-badge-styles";
import { workStatusStyles } from "@/lib/category-styles";
import { cn } from "@/lib/utils";

function findEmployeeByQuery(param) {
  if (!param) return null;
  const normalized = param.trim().toLowerCase();
  return (
    employees.find(
      (employee) =>
        employee.patientId?.toLowerCase() === normalized ||
        employee.id.toLowerCase() === normalized ||
        employee.accountNo?.toLowerCase() === normalized
    ) || null
  );
}

function EmployeeSearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const employeeParam =
    searchParams.get("employee") || searchParams.get("employeeId");

  const selectedEmployee = useMemo(
    () => findEmployeeByQuery(employeeParam),
    [employeeParam]
  );

  const [query, setQuery] = useState("");
  const categoryFilter = searchParams.get("category");

  const filteredRows = useMemo(() => {
    return employeeSearchEntries.filter((entry) => {
      if (categoryFilter === "Injury" || categoryFilter === "Physical") {
        if (entry.category !== categoryFilter) return false;
      }
      return matchesEmployeeSearch(entry, query);
    });
  }, [categoryFilter, query]);

  useEffect(() => {
    // Keep URL clean when an unknown employee code is used
    if (employeeParam && !selectedEmployee) {
      router.replace("/employer/employee-search");
    }
  }, [employeeParam, selectedEmployee, router]);

  if (selectedEmployee) {
    return (
      <EmployeeRecordView
        employee={selectedEmployee}
        onBack={() => router.push("/employer/employee-search")}
      />
    );
  }

  function openEmployee(row) {
    const employee = employees.find((item) => item.id === row.employeeId);
    const code = employee?.patientId || employee?.id || row.employeeId;
    router.push(`/employer/employee-search?employee=${encodeURIComponent(code)}`);
  }

  return (
    <div>
      <PageHeader title="Employee Search" className="mb-1" />
      <p className="mb-4 text-sm text-muted">
        Showing {filteredRows.length} results
      </p>

      <SearchInput
        className="mb-4 max-w-xl"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, account, or SSN"
        ariaLabel="Search employees"
      />

      <Card className="overflow-hidden">
        {filteredRows.length === 0 ? (
          <EmptyState
            icon={UserRound}
            title="No employees match your search"
            description="Try a different name, account number, or SSN."
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
