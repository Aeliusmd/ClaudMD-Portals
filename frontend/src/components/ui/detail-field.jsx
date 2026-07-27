import { cn } from "@/lib/utils";

export function DetailField({ label, value, className }) {
  return (
    <div className={cn("space-y-1", className)}>
      <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
        {label}
      </p>
      <div className="text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}
