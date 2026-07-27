import {
  Building2,
  CalendarDays,
  FileText,
  History,
  Landmark,
  Stethoscope,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { categoryStyles } from "@/lib/category-styles";
import { cn } from "@/lib/utils";

const recipientStyles = {
  Employer: {
    Icon: Building2,
    wrap: "bg-emerald-50 text-emerald-700",
  },
  Insurance: {
    Icon: Landmark,
    wrap: "bg-rose-50 text-rose-700",
  },
  Provider: {
    Icon: Stethoscope,
    wrap: "bg-sky-50 text-sky-700",
  },
};

export function getRecipientStyle(role) {
  return (
    recipientStyles[role] || {
      Icon: Building2,
      wrap: "bg-cream-deep text-muted",
    }
  );
}

export function RecipientIcon({ role, size = "md" }) {
  const { Icon, wrap } = getRecipientStyle(role);
  const box =
    size === "sm" ? "h-8 w-8 rounded-lg" : "h-11 w-11 rounded-xl";
  const icon = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        box,
        wrap
      )}
    >
      <Icon className={icon} />
    </span>
  );
}

export function RecentlySharedHeader({ count }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-ink">Recently Shared</h2>
      </div>
      <span className="text-xs font-medium text-muted">{count} active shares</span>
    </div>
  );
}

export function RecentShareCard({ share, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(share.id)}
      className={cn(
        "flex w-full cursor-pointer items-start gap-3 rounded-xl border bg-white p-4 text-left transition",
        selected
          ? "border-primary bg-[#f3eee4] shadow-[0_0_0_1px_rgba(31,111,235,0.2)]"
          : "border-border/70 bg-[#faf7f1] hover:border-primary/40"
      )}
    >
      <RecipientIcon role={share.sharedWithRole} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-ink">{share.title}</p>
          <Badge className={categoryStyles[share.category]}>
            {share.category}
          </Badge>
        </div>
        <p className="mt-1.5 text-sm text-muted">
          {share.sharedWith} · {share.sharedDate}
        </p>
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" />
          {share.checkIn}
        </p>
      </div>
    </button>
  );
}

export function ShareDetailPanel({ share, onClose, onViewDocument }) {
  if (!share) return null;

  return (
    <Card className="w-full p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">Share Details</h2>
        {onClose ? (
          <button
            type="button"
            aria-label="Close share details"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-muted transition hover:bg-cream-deep hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <Button className="mt-4 w-full cursor-pointer" onClick={onViewDocument}>
        <FileText className="h-4 w-4" />
        View Document
      </Button>

      <div className="mt-5 space-y-4">
        <Detail label="Share ID" value={share.id} />
        <div>
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
            Document
          </p>
          <p className="mt-1 text-sm font-semibold text-ink">{share.title}</p>
          <p className="mt-0.5 text-sm text-muted">{share.documentId}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
            Shared With
          </p>
          <div className="mt-1.5 flex items-center gap-2.5">
            <RecipientIcon role={share.sharedWithRole} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">
                {share.sharedWith}
              </p>
              <p className="text-xs text-muted">{share.sharedWithRole}</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Detail label="Shared Date" value={share.sharedDate} />
          <div>
            <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
              Status
            </p>
            <div className="mt-1.5">
              <Badge className="bg-emerald-100 text-emerald-800">
                {share.status}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-border/70 pt-5">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
          Check-in & Visit
        </p>

        <div className="mt-3 grid grid-cols-2 gap-4">
          <Detail label="Visit ID" value={share.visitId} />
          <div>
            <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
              Category
            </p>
            <div className="mt-1.5">
              <Badge className={categoryStyles[share.category]}>
                {share.category}
              </Badge>
            </div>
          </div>
          <Detail label="Check-in" value={share.checkIn} />
          <Detail label="Provider" value={share.provider} />
          <div className="col-span-2">
            <Detail label="Location" value={share.location} />
          </div>
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
