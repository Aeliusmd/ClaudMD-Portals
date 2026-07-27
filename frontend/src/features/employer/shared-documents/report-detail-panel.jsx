"use client";

import { Download, Eye, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DetailField } from "@/components/ui/detail-field";
import { categoryStyles } from "@/lib/category-styles";
import { openDocumentInNewTab } from "@/lib/documents";
import { reportBadgeStyles } from "@/lib/report-badge-styles";

export function ReportDetailPanel({ doc, onClose, onPreview }) {
  const badgeLabel = doc.badgeLabel || doc.documentType;
  const reportDate = doc.reportDate || doc.shareDate;
  const visitDate = doc.visitDate || "N/A";

  return (
    <Card className="sticky top-6 overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
        <h2 className="text-lg font-semibold text-ink">Report Details</h2>
        <button
          type="button"
          aria-label="Close report details"
          onClick={onClose}
          className="cursor-pointer rounded-full p-1.5 text-muted transition hover:bg-cream-deep hover:text-ink"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 px-5 pt-5">
        <Button className="h-11 w-full" onClick={() => onPreview(doc)}>
          <Eye className="h-4 w-4" />
          View
        </Button>
        <Button
          variant="outline"
          className="h-11 w-full"
          onClick={() => openDocumentInNewTab(doc.url)}
        >
          <Download className="h-4 w-4" />
          Download
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-5 p-5">
        <DetailField label="Employee" value={doc.employee} />
        <DetailField label="Report Title" value={doc.title} />
        <div className="space-y-1">
          <p className="text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">
            Report Type
          </p>
          <Badge
            className={
              reportBadgeStyles[badgeLabel] || "bg-stone-100 text-stone-700"
            }
          >
            {badgeLabel}
          </Badge>
        </div>
        <DetailField label="Incident #" value={doc.incidentNumber} />
        <div className="space-y-1">
          <p className="text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">
            Category
          </p>
          <Badge className={categoryStyles[doc.category]}>{doc.category}</Badge>
        </div>
        <DetailField label="Date of Injury" value={doc.dateOfInjury || "N/A"} />
        <DetailField label="Visit Date" value={visitDate} />
        <DetailField label="Provider" value={doc.provider} />
        <DetailField label="Report Date" value={reportDate} />
        <DetailField label="Shared Date" value={doc.shareDate} />
        <div className="space-y-1">
          <p className="text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">
            Status
          </p>
          {doc.isNew ? (
            <Badge className="bg-rose-50 text-rose-700">New</Badge>
          ) : (
            <span className="text-sm font-semibold text-ink">Viewed</span>
          )}
        </div>
        <DetailField label="Report ID" value={doc.documentId} />
      </div>
    </Card>
  );
}
