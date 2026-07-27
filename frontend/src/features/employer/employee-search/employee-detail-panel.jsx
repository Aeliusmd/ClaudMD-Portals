"use client";

import { useMemo } from "react";
import {
  AlertTriangle,
  Briefcase,
  CalendarDays,
  Download,
  Eye,
  FileText,
  UserRound,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DetailField } from "@/components/ui/detail-field";
import { employerAppointments, sharedDocuments } from "@/data/employer";
import { categoryStyles, workStatusStyles } from "@/lib/category-styles";
import { openDocumentInNewTab } from "@/lib/documents";
import { reportBadgeStyles } from "@/lib/report-badge-styles";
import { cn } from "@/lib/utils";

function SectionTitle({ icon: Icon, title, tone = "default", badge }) {
  const tones = {
    default: "text-ink",
    danger: "text-rose-800",
    success: "text-emerald-800",
    summary: "text-ink",
  };
  const iconTones = {
    default: "text-muted",
    danger: "text-rose-600",
    success: "text-emerald-600",
    summary: "text-primary",
  };

  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {Icon ? <Icon className={cn("h-4 w-4", iconTones[tone])} /> : null}
        <h3
          className={cn(
            "text-[11px] font-semibold tracking-[0.1em] uppercase",
            tones[tone]
          )}
        >
          {title}
        </h3>
      </div>
      {badge}
    </div>
  );
}

export function EmployeeDetailPanel({
  employee,
  incident,
  checkInDate,
  onClose,
  onPreview,
}) {
  const reports = useMemo(
    () =>
      sharedDocuments
        .filter((doc) => doc.employeeId === employee.id)
        .sort((a, b) => (a.dateValue < b.dateValue ? 1 : -1)),
    [employee.id]
  );

  const appointments = useMemo(
    () =>
      employerAppointments.filter(
        (appt) =>
          appt.employee === employee.name && appt.status !== "Completed"
      ),
    [employee.name]
  );

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-white">
              <UserRound className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold text-ink">{employee.name}</h2>
                <Badge className={categoryStyles[incident.category]}>
                  {incident.category}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted">
                {employee.patientId || employee.employeeId} · {employee.accountNo}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close employee detail"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-2 text-muted transition hover:bg-cream-deep hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </Card>

      <div className="grid items-start gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <div>
            <SectionTitle icon={FileText} title="Summary" tone="summary" />
            <Card className="p-5">
              <SectionTitle icon={FileText} title="Patient Information" />
              <div className="grid gap-4 sm:grid-cols-2">
                <DetailField label="Patient Name" value={employee.name} />
                <DetailField label="Account No." value={employee.accountNo} />
                <DetailField
                  label="SSN"
                  value={employee.ssn || `***-**-${employee.ssnLast4}`}
                />
                <DetailField label="Employer Name" value={employee.employerName} />
                <DetailField
                  label="Insurance Company"
                  value={employee.insuranceCompany}
                  className="sm:col-span-2"
                />
              </div>
            </Card>
          </div>

          <Card className="p-5">
            <SectionTitle
              icon={AlertTriangle}
              title="Incident & Check-in"
              tone="danger"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailField label="Incident No." value={incident.incidentNumber} />
              <DetailField
                label="Checked In Date"
                value={checkInDate || incident.checkInDate}
              />
              <DetailField
                label="Date of Injury"
                value={incident.dateOfInjury || "N/A"}
              />
              <DetailField
                label="Time of Injury"
                value={incident.timeOfInjury || "N/A"}
              />
              <DetailField
                label="From Date"
                value={incident.fromDate || incident.dateOfInjury || "N/A"}
              />
              <DetailField
                label="To Date"
                value={incident.toDate || incident.followUpDate || "N/A"}
              />
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle
              icon={Briefcase}
              title="Work & Disability Status"
              tone="success"
            />
            <div className="space-y-4">
              <DetailField
                label="Work Status"
                value={
                  <Badge
                    className={
                      workStatusStyles[incident.workStatus] ||
                      "bg-amber-50 text-amber-700"
                    }
                  >
                    {incident.workStatus}
                  </Badge>
                }
              />
              <DetailField
                label="Disability Status"
                value={
                  <Badge className="bg-rose-50 text-rose-700">
                    {incident.disabilityStatus}
                  </Badge>
                }
              />
              <DetailField label="Restrictions" value={incident.restrictions} />
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle
              icon={CalendarDays}
              title="Appointments"
              tone="success"
              badge={
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-100 px-2 text-xs font-semibold text-emerald-800">
                  {appointments.length}
                </span>
              }
            />
            {appointments.length === 0 ? (
              <p className="text-sm text-muted">No upcoming appointments.</p>
            ) : (
              <div className="divide-y divide-border/60">
                {appointments.map((appt) => (
                  <div
                    key={appt.id}
                    className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                        <CalendarDays className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">{appt.type}</p>
                        <p className="mt-0.5 text-sm text-muted">
                          {appt.provider} · {appt.clinic}
                        </p>
                        <p className="mt-0.5 text-sm text-muted">
                          {appt.date} · {appt.time}
                        </p>
                      </div>
                    </div>
                    <Badge className="bg-sky-100 text-sky-800">{appt.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div>
          <SectionTitle
            icon={FileText}
            title="Reports"
            badge={
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary/10 px-2 text-xs font-semibold text-primary">
                {reports.length}
              </span>
            }
          />
          <Card className="p-4">
            {reports.length === 0 ? (
              <p className="px-1 py-6 text-center text-sm text-muted">
                No shared reports for this employee.
              </p>
            ) : (
              <div className="space-y-3">
                {reports.map((doc) => {
                  const badgeLabel = doc.badgeLabel || doc.documentType;
                  return (
                    <div
                      key={doc.id}
                      className="flex items-start gap-3 rounded-xl border border-border/70 p-3.5"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#e8f1fb] text-primary">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-ink">{doc.title}</p>
                          <Badge
                            className={
                              reportBadgeStyles[badgeLabel] ||
                              "bg-stone-100 text-stone-700"
                            }
                          >
                            {badgeLabel}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted">
                          {doc.shareDate} · {doc.provider}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Preview ${doc.title}`}
                          onClick={() => onPreview(doc)}
                          className="cursor-pointer rounded-full p-2 text-muted transition hover:bg-cream-deep hover:text-ink"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Download ${doc.title}`}
                          onClick={() => openDocumentInNewTab(doc.url)}
                          className="cursor-pointer rounded-full p-2 text-muted transition hover:bg-cream-deep hover:text-ink"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
