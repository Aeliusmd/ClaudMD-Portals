import { cn } from "@/lib/utils";

export function SummaryStatCard({
  active,
  label,
  value,
  valueClassName,
  iconWrap,
  icon,
  onClick,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-w-[10.5rem] flex-1 snap-start cursor-pointer items-center gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm transition sm:min-w-0 sm:p-5",
        active
          ? "border-primary ring-2 ring-primary/20"
          : "border-border/70 hover:border-primary/30"
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          iconWrap
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p
          className={cn(
            "font-sans text-2xl font-semibold tabular-nums leading-none sm:text-3xl",
            valueClassName
          )}
        >
          {value}
        </p>
        <p className="mt-1.5 text-xs font-medium text-muted sm:text-sm">
          {label}
        </p>
      </div>
    </button>
  );
}
