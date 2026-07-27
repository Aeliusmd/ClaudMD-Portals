"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DateRangeInput } from "@/components/ui/date-range-input";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, paginateItems } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { employerAppointments } from "@/data/employer";
import { categoryStyles } from "@/lib/category-styles";
import { cn } from "@/lib/utils";

const employerAppointmentStatusStyles = {
  Confirmed: "bg-sky-100 text-sky-800",
  Pending: "bg-amber-50 text-amber-700",
  Completed: "bg-stone-100 text-stone-600",
};

export function EmployerAppointmentsView() {
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return employerAppointments.filter((row) => {
      if (fromDate && row.dateValue < fromDate) return false;
      if (toDate && row.dateValue > toDate) return false;
      if (
        normalizedQuery &&
        !row.employee.toLowerCase().includes(normalizedQuery)
      ) {
        return false;
      }
      return true;
    });
  }, [fromDate, toDate, query]);

  useEffect(() => {
    setPage(1);
  }, [fromDate, toDate, query]);

  const paged = paginateItems(rows, page);

  return (
    <div>
      <PageHeader title="Appointments" className="mb-5" />

      <div className="mb-2 flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
        <SearchInput
          className="min-w-0 flex-1"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by employee name"
          ariaLabel="Search by employee name"
        />

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <DateRangeInput
            id="appointments-from"
            label="From"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
          <span className="text-sm text-muted">to</span>
          <DateRangeInput
            id="appointments-to"
            label="To"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
      </div>

      <p className="mb-4 text-sm text-[#8B6D4F]">
        Showing {rows.length} appointment{rows.length === 1 ? "" : "s"}
      </p>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No appointments match your filters"
            description="Try adjusting your search, date range, or filters."
            className="min-h-72 rounded-none border-0 border-none bg-white"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-[56rem] w-full text-left text-sm">
                <thead className="border-b border-border/70 bg-cream/40 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                  <tr>
                    <th className="px-5 py-3">Employee</th>
                    <th className="px-5 py-3">Category</th>
                    <th className="px-5 py-3">Provider</th>
                    <th className="px-5 py-3">Type</th>
                    <th className="px-5 py-3">Clinic</th>
                    <th className="px-5 py-3">Date & Time</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {paged.items.map((row) => (
                    <tr
                      key={row.id}
                      className="bg-white transition hover:bg-cream/40"
                    >
                      <td className="px-5 py-4 font-semibold text-ink">
                        {row.employee}
                      </td>
                      <td className="px-5 py-4">
                        <Badge className={categoryStyles[row.category]}>
                          {row.category}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-ink">{row.provider}</td>
                      <td className="px-5 py-4 text-ink">{row.type}</td>
                      <td className="px-5 py-4 text-ink">{row.clinic}</td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-ink">{row.date}</p>
                        <p className="text-xs text-muted">{row.time}</p>
                      </td>
                      <td className="px-5 py-4">
                        <Badge
                          className={cn(
                            employerAppointmentStatusStyles[row.status] ||
                              "bg-stone-100 text-stone-600"
                          )}
                        >
                          {row.status}
                        </Badge>
                      </td>
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
