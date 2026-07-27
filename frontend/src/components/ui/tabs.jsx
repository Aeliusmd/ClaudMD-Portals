import { cn } from "@/lib/utils";

export function Tabs({ items, value, onChange, className, tone = "default" }) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {items.map((item) => {
        const active = item.id === value;
        const activeClass =
          tone === "category"
            ? item.activeClass || "bg-primary text-white"
            : "bg-primary text-white";
        const idleClass =
          tone === "category"
            ? item.idleClass || "bg-cream-deep text-ink"
            : "bg-cream-deep text-ink hover:bg-border";

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              "cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              active ? activeClass : idleClass
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
