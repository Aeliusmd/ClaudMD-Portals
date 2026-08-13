import { formatDateTimeCompactMMDDYY } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** Share timestamp for sharedid link tiles: MM/DD/YY  HH:MM AM/PM */
export function SharedAtStamp({ value, className }) {
  const label = formatDateTimeCompactMMDDYY(value);
  if (!label) return null;
  return (
    <p
      className={cn(
        "text-xs font-semibold tabular-nums text-sky-400",
        className
      )}
    >
      Shared {label}
    </p>
  );
}
