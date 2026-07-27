"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, Download, Eye, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DocumentPreviewModal } from "@/components/ui/document-preview-modal";
import { PanelHeader } from "@/components/ui/panel-header";
import { SummaryCard } from "@/components/ui/summary-card";
import {
  employerDashboardSummary,
  newEmployerReports,
  recentActivity,
  upcomingEmployerAppointments,
} from "@/data/employer";
import {
  appointmentStatusStyles,
  categoryStyles,
  workStatusStyles,
} from "@/lib/category-styles";
import { openDocumentInNewTab } from "@/lib/documents";

export function EmployerDashboardView() {
  const { upcomingAppointments, newReports } = employerDashboardSummary;
  const [previewDocument, setPreviewDocument] = useState(null);

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2">
        <SummaryCard
          title="Upcoming Appointments"
          value={upcomingAppointments.count}
          detail={upcomingAppointments.detail}
          icon={CalendarDays}
        />
        <SummaryCard
          title="New Reports"
          value={newReports.count}
          detail={newReports.detail}
          icon={FileText}
        />
      </div>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[1.45fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
            <h2 className="text-lg font-semibold text-ink">Recent Activity</h2>
            <Link
              href="/employer/employee-search"
              className="text-sm font-semibold text-primary hover:text-primary-dark"
            >
              View All
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[40rem] w-full text-left text-sm">
              <thead className="border-y border-border/70 bg-cream/50 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                <tr>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Incident #</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Last Visit</th>
                  <th className="px-5 py-3">Work Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {recentActivity.map((row) => (
                  <tr key={row.id} className="bg-white">
                    <td className="px-5 py-4 font-semibold text-ink">
                      {row.employee}
                    </td>
                    <td className="px-5 py-4 text-muted">{row.incidentNumber}</td>
                    <td className="px-5 py-4">
                      <Badge className={categoryStyles[row.category]}>
                        {row.category}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-ink">{row.lastVisit}</td>
                    <td className="px-5 py-4">
                      <Badge
                        className={
                          workStatusStyles[row.workStatus] ||
                          "bg-stone-100 text-stone-600"
                        }
                      >
                        {row.workStatus}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <PanelHeader
              title="Upcoming Appointments"
              description="Next 30 days across all employees."
              viewAllHref="/employer/appointments"
            />

            <div className="divide-y divide-border/60">
              {upcomingEmployerAppointments.map((appt) => (
                <div key={appt.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-ink">{appt.employee}</p>
                        <Badge className={categoryStyles[appt.category]}>
                          {appt.category}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-ink">
                        {appt.visitType} — {appt.provider}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {appt.clinic} · {appt.date} · {appt.time}
                      </p>
                    </div>
                    <Badge
                      className={
                        appointmentStatusStyles[appt.status] ||
                        "bg-stone-100 text-stone-600"
                      }
                    >
                      {appt.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <PanelHeader
              title="New Reports & Documents"
              description="Recently shared reports requiring review."
              viewAllHref="/employer/shared-documents"
            />

            <div className="space-y-4">
              {newEmployerReports.map((doc) => (
                <div
                  key={doc.id}
                  className="rounded-xl border border-border/70 p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#e8f1fb] text-primary">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-ink">{doc.title}</p>
                        {doc.isNew ? (
                          <Badge className="bg-primary text-white">NEW</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-muted">
                        {doc.employee} · {doc.shareDate}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          className="px-3 py-1.5 text-xs"
                          onClick={() => setPreviewDocument(doc)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Preview
                        </Button>
                        <Button
                          variant="outline"
                          className="px-3 py-1.5 text-xs"
                          onClick={() => openDocumentInNewTab(doc.url)}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {previewDocument ? (
        <DocumentPreviewModal
          file={previewDocument}
          onClose={() => setPreviewDocument(null)}
        />
      ) : null}
    </div>
  );
}
