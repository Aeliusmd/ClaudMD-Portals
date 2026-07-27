"use client";

import { useState } from "react";
import { CalendarDays, Clock3, Download, Eye, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DocumentPreviewModal } from "@/components/ui/document-preview-modal";
import { PanelHeader } from "@/components/ui/panel-header";
import { SummaryCard } from "@/components/ui/summary-card";
import { currentPatient, dashboardSummary } from "@/data/patient";
import { newlySharedDocuments } from "@/data/documents";
import { recentVisits } from "@/data/visits";
import { openDocumentInNewTab } from "@/lib/documents";
import { visitStatusStyles } from "@/lib/category-styles";

export function PatientDashboardView() {
  const { upcomingAppointment, latestVisit, newDocuments } = dashboardSummary;
  const [previewDocument, setPreviewDocument] = useState(null);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
          Welcome, {currentPatient.fullName}
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Here is a summary of your recent activity and upcoming appointments.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          title="Upcoming Appointment"
          value={upcomingAppointment.date}
          detail={upcomingAppointment.detail}
          icon={CalendarDays}
        />
        <SummaryCard
          title="Latest Visit"
          value={latestVisit.date}
          detail={latestVisit.detail}
          icon={Clock3}
        />
        <SummaryCard
          title="New Documents"
          value={newDocuments.count}
          detail={newDocuments.detail}
          icon={FileText}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <PanelHeader
            title="Recent Visits"
            description="Your check-in history from the last 6 months."
            viewAllHref="/patient/visits"
          />

          <div className="divide-y divide-border/70">
            {recentVisits.map((visit) => (
              <div
                key={visit.id}
                className="flex items-center justify-between gap-4 py-4"
              >
                <div>
                  <p className="font-semibold text-ink">
                    {visit.date} · {visit.location}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {visit.category} · {visit.provider}
                  </p>
                </div>
                <Badge className={visitStatusStyles[visit.status]}>
                  {visit.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <PanelHeader
            title="Newly Shared Documents"
            description="Reports explicitly shared with you by the clinic."
            viewAllHref="/patient/document-share"
          />

          <div className="space-y-4">
            {newlySharedDocuments.map((doc) => (
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
                    <p className="mt-1 text-sm text-muted">{doc.date}</p>
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

      {previewDocument ? (
        <DocumentPreviewModal
          file={previewDocument}
          onClose={() => setPreviewDocument(null)}
        />
      ) : null}
    </div>
  );
}
