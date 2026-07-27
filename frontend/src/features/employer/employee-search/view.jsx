"use client";

import { useMemo, useState } from "react";
import {
  CalendarCheck,
  FileText,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { EmployerCategoryFilter } from "@/components/employer/category-filter";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DateRangeInput } from "@/components/ui/date-range-input";
import { DocumentPreviewModal } from "@/components/ui/document-preview-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { EmployeeDetailPanel } from "@/features/employer/employee-search/employee-detail-panel";
import {
  matchesEmployeeSearch,
  parseDisplayDate,
} from "@/features/employer/employee-search/search-utils";
import { employeeSearchEntries, employees } from "@/data/employer";
import { workStatusStyles } from "@/lib/category-styles";
import { cn } from "@/lib/utils";

export function EmployerEmployeeSearchView() {
  const [category, setCategory] = useState(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [query, setQuery] = useState("");
  const [incidentFilter, setIncidentFilter] = useState("");
  const [selectedRowId, setSelectedRowId] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);

  const categoryEntries = useMemo(() => {
    if (!category) return employeeSearchEntries;
    return employeeSearchEntries.filter((entry) => entry.category === category);
  }, [category]);

  const filteredRows = useMemo(() => {
    return categoryEntries.filter((entry) => {
      const entryDate = parseDisplayDate(entry.date);
      if (fromDate) {
        const from = new Date(fromDate);
        if (!entryDate || entryDate < from) return false;
      }
      if (toDate) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        if (!entryDate || entryDate > to) return false;
      }

      if (incidentFilter && entry.id !== incidentFilter) return false;
      if (!matchesEmployeeSearch(entry, query)) return false;

      return true;
    });
  }, [categoryEntries, fromDate, toDate, incidentFilter, query]);

  const selectedRow =
    filteredRows.find((row) => row.id === selectedRowId) || null;

  const selectedEmployee = selectedRow
    ? employees.find((employee) => employee.id === selectedRow.employeeId)
    : null;

  const selectedIncident = selectedEmployee
    ? selectedEmployee.incidents.find(
        (incident) => incident.id === selectedRow.incidentId
      )
    : null;

  const hasDateFilter = Boolean(fromDate || toDate);

  function handleCategoryChange(nextCategory) {
    setCategory((prev) => (prev === nextCategory ? null : nextCategory));
    setIncidentFilter("");
    setSelectedRowId(null);
  }

  return (
    <div>
      <PageHeader title="Employee Search" className="mb-5" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <EmployerCategoryFilter
          value={category}
          onChange={handleCategoryChange}
        />

        <div className="hidden h-8 w-px bg-border sm:block" aria-hidden="true" />

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <DateRangeInput
            id="employee-search-from"
            label="From"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setSelectedRowId(null);
            }}
          />
          <span className="text-sm text-muted">to</span>
          <DateRangeInput
            id="employee-search-to"
            label="To"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setSelectedRowId(null);
            }}
          />
          {hasDateFilter ? (
            <button
              type="button"
              onClick={() => {
                setFromDate("");
                setToDate("");
                setSelectedRowId(null);
              }}
              className="inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-muted transition hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <div className="mb-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-4">
        <SearchInput
          className="min-w-0 flex-1"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedRowId(null);
          }}
          onClear={() => setSelectedRowId(null)}
          placeholder="Last Name, First Name, or SSN"
          ariaLabel="Search employees"
        />

        <label className="block w-full shrink-0 lg:w-[17.5rem]">
          <span className="mb-1.5 block text-[11px] font-semibold tracking-[0.08em] text-[#8B6D4F] uppercase">
            Incident & Check-in Date
          </span>
          <select
            value={incidentFilter}
            onChange={(e) => {
              setIncidentFilter(e.target.value);
              setSelectedRowId(e.target.value || null);
            }}
            className="h-[3.15rem] w-full rounded-2xl border border-border bg-white px-4 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="">All</option>
            {categoryEntries.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.employeeName} — {entry.incidentNumber} — {entry.date}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mb-4 text-sm text-muted">
        Showing {filteredRows.length} result
        {filteredRows.length === 1 ? "" : "s"}
      </p>

      {filteredRows.length > 0 ? (
        <Card className="mb-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[88rem] w-full text-left text-sm">
              <thead className="border-b border-border/70 bg-cream/40 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                <tr>
                  <th className="px-5 py-3">Patient Name</th>
                  <th className="px-5 py-3">Account No.</th>
                  <th className="px-5 py-3">Employer Name</th>
                  <th className="px-5 py-3">Insurance Company</th>
                  <th className="px-5 py-3">Report Type</th>
                  <th className="px-5 py-3">Checked-In Date</th>
                  <th className="px-5 py-3">Incident No.</th>
                  <th className="px-5 py-3">Date of Injury</th>
                  <th className="px-5 py-3">Time of Injury</th>
                  <th className="px-5 py-3">Disability / Work Status</th>
                  <th className="px-5 py-3">From Date</th>
                  <th className="px-5 py-3">To Date</th>
                  <th className="px-5 py-3">Restrictions</th>
                  <th className="px-5 py-3">Reports</th>
                  <th className="px-5 py-3">Appointments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredRows.map((row) => {
                  const active = selectedRowId === row.id;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedRowId(row.id)}
                      className={cn(
                        "cursor-pointer bg-white transition hover:bg-cream/50",
                        active && "bg-sky-50/80"
                      )}
                    >
                      <td className="px-5 py-4 font-semibold text-ink">
                        {row.employeeName}
                      </td>
                      <td className="px-5 py-4 text-ink">{row.accountNo}</td>
                      <td className="px-5 py-4 text-ink">{row.employerName}</td>
                      <td className="max-w-[12rem] truncate px-5 py-4 text-ink">
                        {row.insuranceCompany}
                      </td>
                      <td className="px-5 py-4">
                        <Badge className="bg-emerald-50 text-emerald-700">
                          {row.reportType}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-ink">{row.date}</td>
                      <td className="px-5 py-4 text-ink">{row.incidentNumber}</td>
                      <td className="px-5 py-4 text-ink">
                        {row.dateOfInjury || "N/A"}
                      </td>
                      <td className="px-5 py-4 text-ink">
                        {row.timeOfInjury || "N/A"}
                      </td>
                      <td className="px-5 py-4">
                        <Badge
                          className={
                            workStatusStyles[row.workStatus] ||
                            "bg-emerald-50 text-emerald-700"
                          }
                        >
                          {row.workStatus}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-ink">{row.fromDate}</td>
                      <td className="px-5 py-4 text-ink">{row.toDate}</td>
                      <td className="max-w-[10rem] truncate px-5 py-4 text-ink">
                        {row.restrictions}
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 text-ink">
                          <FileText className="h-4 w-4 text-muted" />
                          {row.reportCount}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 text-ink">
                          <CalendarCheck className="h-4 w-4 text-muted" />
                          {row.appointmentCount}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <EmptyState
          icon={Search}
          title="No results found"
          description={
            category
              ? "Try adjusting your search or filter criteria."
              : "Try adjusting your search, or select Injury or Physical to narrow by category."
          }
          className="mb-6 min-h-48 border-solid"
        />
      )}

      {!selectedEmployee || !selectedIncident ? (
        <EmptyState
          icon={UserRound}
          title="Select an employee"
          description="View summary, reports, and appointments"
          className="min-h-64 border-solid"
        />
      ) : (
        <EmployeeDetailPanel
          employee={selectedEmployee}
          incident={selectedIncident}
          checkInDate={selectedRow.date}
          onClose={() => setSelectedRowId(null)}
          onPreview={(doc) =>
            setPreviewDocument({
              title: doc.title,
              documentId: doc.documentId,
              url: doc.url,
            })
          }
        />
      )}

      {previewDocument ? (
        <DocumentPreviewModal
          file={previewDocument}
          onClose={() => setPreviewDocument(null)}
        />
      ) : null}
    </div>
  );
}
