import { Badge } from "@/components/ui/badge";
import { categoryStyles, visitStatusStyles } from "@/lib/category-styles";
import { cn } from "@/lib/utils";

export function VisitCard({ visit, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(visit.id)}
      className={cn(
        "w-full cursor-pointer rounded-2xl border bg-white p-4 text-left transition",
        selected
          ? "border-primary/60 shadow-[0_0_0_1px_rgba(29,120,214,0.22)]"
          : "border-border/70 hover:border-primary/40"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge className={categoryStyles[visit.category]}>
            {visit.category}
          </Badge>
          <span className="text-xs font-medium tabular-nums text-muted">
            {visit.id}
          </span>
        </div>
        <Badge className={cn("shrink-0", visitStatusStyles[visit.status])}>
          {visit.status}
        </Badge>
      </div>
      <p className="mt-3 text-[0.95rem] font-semibold text-ink sm:text-base">
        {visit.provider} — {visit.location}
      </p>
      <p className="mt-1 text-sm text-muted">{visit.date}</p>
    </button>
  );
}
