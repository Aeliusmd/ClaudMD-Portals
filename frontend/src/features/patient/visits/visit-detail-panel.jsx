import { ChevronRight, FileText, Info, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { categoryStyles } from "@/lib/category-styles";

export function VisitDetailPanel({ visit, onClose, onSelectDocument }) {
  if (!visit) return null;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">Visit Details</h2>
        {onClose ? (
          <button
            type="button"
            aria-label="Close visit details"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-muted transition hover:bg-cream-deep hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="mt-5 space-y-4">
        <Detail label="Visit ID" value={visit.id} />
        <Detail label="Date" value={visit.date} />
        <div>
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
            Category
          </p>
          <div className="mt-1.5">
            <Badge className={categoryStyles[visit.category]}>
              {visit.category}
            </Badge>
          </div>
        </div>
        <Detail
          label="Provider / Location"
          value={`${visit.provider} — ${visit.location}`}
        />
        <Detail label="Work Status" value={visit.workStatus} />
        <Detail label="Restrictions" value={visit.restrictions} />
        <Detail label="Follow-up" value={visit.followUp} />
      </div>

      <div className="mt-6">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-amber-500" />
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
            Special Instructions
          </p>
        </div>
        <div className="mt-2 rounded-xl border border-amber-100 bg-[#fff8e8] px-4 py-3">
          <p className="text-sm leading-relaxed text-ink">
            {visit.specialInstructions}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
            Documents ({visit.documents.length})
          </p>
        </div>
        <div className="mt-3 space-y-3">
          {visit.documents.map((doc) => (
            <button
              key={doc.id || doc.title}
              type="button"
              onClick={() => onSelectDocument?.(doc)}
              className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border/70 bg-white px-4 py-3 text-left transition hover:border-primary/30 hover:bg-cream"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#e8f1fb] text-primary">
                <FileText className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">{doc.title}</span>
                <span className="mt-0.5 block text-sm text-muted">
                  {doc.type} • {doc.date}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-ink">{value}</p>
    </div>
  );
}
