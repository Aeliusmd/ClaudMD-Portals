"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PAGE_SIZE, Pagination } from "@/components/ui/pagination";
import { Tabs } from "@/components/ui/tabs";
import { CreatePatientAppointmentModal } from "@/features/patient/appointments/create-appointment-modal";
import { fetchPatientAppointments } from "@/lib/api/patient";
import { getAccessToken } from "@/lib/auth-session";
import { appointmentStatusStyles } from "@/lib/category-styles";
import { patientPaths } from "@/lib/portal-paths";
import { cn } from "@/lib/utils";

const filterTabs = [
  { id: "all", label: "All" },
  { id: "upcoming", label: "Upcoming" },
  { id: "completed", label: "Completed" },
];

export function PatientAppointmentsView() {
  const router = useRouter();
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setPage(1);
  }, [filter]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = getAccessToken();
      if (!token) {
        router.replace(patientPaths.login);
        return;
      }

      setLoading(true);
      try {
        const data = await fetchPatientAppointments(token, {
          scope: filter,
          page,
          pageSize: PAGE_SIZE,
        });
        if (!cancelled) {
          setRows(data.items || []);
          setTotal(data.total || 0);
          setTotalPages(data.totalPages || 1);
          setError(null);
        }
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 401) {
          router.replace(patientPaths.login);
          return;
        }
        setRows([]);
        setTotal(0);
        setTotalPages(1);
        setError(err?.message || "Unable to load appointments.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [filter, page, reloadKey, router]);

  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  function handleCreate() {
    setFilter("upcoming");
    setPage(1);
    setReloadKey((key) => key + 1);
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

      {error ? (
        <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <Card className="overflow-hidden">
        {loading ? (
          <div className="space-y-3 px-5 py-6">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-12 animate-pulse rounded-xl bg-cream/80"
              />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No appointments found"
            description={
              filter === "upcoming"
                ? "Book an Urgent Care or Personal Injury appointment to see it here."
                : "No appointments match this filter."
            }
            className="min-h-56 rounded-none border-0"
          />
        ) : (
          <>
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
                  {rows.map((row, index) => (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-b border-border/60 last:border-b-0",
                        index === 0 ? "bg-cream/35" : "bg-white"
                      )}
                    >
                      <td className="px-5 py-4">
                        <p className="font-semibold text-ink">{row.doctor}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {row.specialty}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-ink">{row.type}</td>
                      <td className="px-5 py-4 text-ink">
                        {row.location || "—"}
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-ink">{row.date}</p>
                        <p className="mt-0.5 text-xs text-muted">{row.time}</p>
                      </td>
                      <td className="px-5 py-4">
                        <Badge
                          className={
                            appointmentStatusStyles[row.status] ||
                            "bg-stone-100 text-stone-600"
                          }
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

      <CreatePatientAppointmentModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={handleCreate}
      />
    </div>
  );
}
