"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import {
  Pagination,
  paginateItems,
} from "@/components/ui/pagination";
import { Tabs } from "@/components/ui/tabs";
import { CreatePatientAppointmentModal } from "@/features/patient/appointments/create-appointment-modal";
import { appointments as initialAppointments } from "@/data/appointments";
import { appointmentStatusStyles } from "@/lib/category-styles";
import { cn } from "@/lib/utils";

const filterTabs = [
  { id: "all", label: "All" },
  { id: "upcoming", label: "Upcoming" },
  { id: "completed", label: "Completed" },
];

export function PatientAppointmentsView() {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(initialAppointments);
  const [showCreate, setShowCreate] = useState(false);

  const filtered = useMemo(() => {
    if (filter === "upcoming") {
      return rows.filter((item) => item.status !== "Completed");
    }
    if (filter === "completed") {
      return rows.filter((item) => item.status === "Completed");
    }
    return rows;
  }, [filter, rows]);

  useEffect(() => {
    setPage(1);
  }, [filter]);

  const paged = paginateItems(filtered, page);

  function handleCreate(appointment) {
    setRows((prev) => [appointment, ...prev]);
    setFilter("upcoming");
    setPage(1);
  }

  return (
    <div>
      <PageHeader
        title="Appointments"
        className="mb-5"
        actions={
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Tabs
              value={filter}
              onChange={setFilter}
              items={filterTabs}
              className="flex-wrap"
            />
            <Button
              onClick={() => setShowCreate(true)}
              className="shrink-0 self-start sm:self-auto"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              Create Appointment
            </Button>
          </div>
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
            <tbody>
              {paged.items.map((row, index) => (
                <tr
                  key={row.id}
                  className={cn(
                    "border-b border-border/60 last:border-b-0",
                    index === 0 ? "bg-cream/35" : "bg-white"
                  )}
                >
                  <td className="px-5 py-4">
                    <p className="font-semibold text-ink">{row.doctor}</p>
                    <p className="mt-0.5 text-xs text-muted">{row.specialty}</p>
                  </td>
                  <td className="px-5 py-4 text-ink">{row.type}</td>
                  <td className="px-5 py-4 text-ink">{row.location}</td>
                  <td className="px-5 py-4">
                    <p className="font-semibold text-ink">{row.date}</p>
                    <p className="mt-0.5 text-xs text-muted">{row.time}</p>
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

      <CreatePatientAppointmentModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={handleCreate}
      />
    </div>
  );
}
