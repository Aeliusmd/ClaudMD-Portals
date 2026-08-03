"use client";

import Link from "next/link";
import { CalendarDays, Clock3, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { currentPatient, dashboardSummary } from "@/data/patient";
import { recentVisits } from "@/data/visits";
import { visitStatusStyles } from "@/lib/category-styles";
import { cn } from "@/lib/utils";

function SummaryTile({ title, value, detail, icon: Icon }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="mt-2 font-sans text-3xl font-semibold tracking-tight text-ink tabular-nums sm:text-[2rem]">
            {value}
          </p>
          <p className="mt-1.5 text-sm text-muted">{detail}</p>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f3ebe1] text-[#8B6D4F]">
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </div>
      </div>
    </Card>
  );
}

export function PatientDashboardView() {
  const { upcomingAppointment, latestVisit, newDocuments } = dashboardSummary;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Welcome, {currentPatient.fullName}
        </h1>
        <p className="mt-1.5 text-sm text-muted sm:text-[0.95rem]">
          Here is a summary of your recent activity and upcoming appointments.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryTile
          title="Upcoming Appointment"
          value={upcomingAppointment.date}
          detail={upcomingAppointment.detail}
          icon={CalendarDays}
        />
        <SummaryTile
          title="Latest Visit"
          value={latestVisit.date}
          detail={latestVisit.detail}
          icon={Clock3}
        />
        <SummaryTile
          title="New Documents"
          value={newDocuments.count}
          detail={newDocuments.detail}
          icon={FileText}
        />
      </div>

      <section className="mt-8">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink sm:text-xl">
              Recent Visits
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              Your check-in history from the last 6 months.
            </p>
          </div>
          <Link
            href="/patient/visits"
            className="shrink-0 cursor-pointer text-sm font-semibold text-primary hover:text-primary-dark"
          >
            View All
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {recentVisits.map((visit) => (
            <Card key={visit.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-muted">{visit.date}</p>
                  <p className="mt-1.5 text-base font-semibold text-ink">
                    {visit.location}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {visit.category} · {visit.provider}
                  </p>
                </div>
                <Badge
                  className={cn(
                    "shrink-0",
                    visitStatusStyles[visit.status] ||
                      "bg-emerald-50 text-emerald-700"
                  )}
                >
                  {visit.status}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
