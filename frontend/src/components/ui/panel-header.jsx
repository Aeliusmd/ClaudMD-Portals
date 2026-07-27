import Link from "next/link";
import { cn } from "@/lib/utils";

export function PanelHeader({
  title,
  description,
  viewAllHref,
  viewAllLabel = "View All",
  className,
}) {
  return (
    <div
      className={cn(
        "mb-4 flex items-start justify-between gap-3",
        className
      )}
    >
      <div>
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sm text-muted">{description}</p>
        ) : null}
      </div>
      {viewAllHref ? (
        <Link
          href={viewAllHref}
          className="shrink-0 text-sm font-semibold text-primary hover:text-primary-dark"
        >
          {viewAllLabel}
        </Link>
      ) : null}
    </div>
  );
}
