"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  Pagination,
  paginateItems,
} from "@/components/ui/pagination";
import { Tabs } from "@/components/ui/tabs";
import { appointments } from "@/data/appointments";
import { appointmentStatusStyles } from "@/lib/category-styles";

export function PatientAppointmentsView() {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);

  const rows = useMemo(() => {
    if (filter === "upcoming") {
      return appointments.filter((a) => a.status !== "Completed");
    }
    if (filter === "completed") {
      return appointments.filter((a) => a.status === "Completed");
    }
    return appointments;
  }, [filter]);

  useEffect(() => {
    setPage(1);
  }, [filter]);

  const paged = paginateItems(rows, page);

  return (
    <div>
      <PageHeader
        title="Appointments"
        actions={
          <Tabs
            value={filter}
            onChange={setFilter}
            items={[
              { id: "all", label: "All" },
              { id: "upcoming", label: "Upcoming" },
              { id: "completed", label: "Completed" },
            ]}
          />
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
      <table className="min-w-[48rem] w-full text-left text-sm">
            <thead className="border-b border-border/80 bg-cream/40 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
              <tr>
                <th className="px-5 py-3">Doctor</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Location</th>
                <th className="px-5 py-3">Date & Time</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {paged.items.map((row) => (
                <tr key={row.id} className="bg-white">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-ink">{row.doctor}</p>
                    <p className="text-xs text-muted">{row.specialty}</p>
                  </td>
                  <td className="px-5 py-4 text-ink">{row.type}</td>
                  <td className="px-5 py-4 text-ink">{row.location}</td>
                  <td className="px-5 py-4">
                    <p className="font-medium text-ink">{row.date}</p>
                    <p className="text-xs text-muted">{row.time}</p>
                  </td>
                  <td className="px-5 py-4">
                    <Badge className={appointmentStatusStyles[row.status]}>
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
      </Card>
    </div>
  );
}
