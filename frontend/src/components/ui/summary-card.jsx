import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function SummaryCard({ title, value, detail, icon: Icon, className }) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted">{title}</p>
          <p className="mt-2 font-sans text-3xl font-semibold tabular-nums tracking-tight text-ink md:text-4xl">
            {value}
          </p>
          <p className="mt-1.5 text-sm text-muted">{detail}</p>
        </div>
        {Icon ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cream-deep text-[#8a6a4a]">
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
      </div>
    </Card>
  );
}
