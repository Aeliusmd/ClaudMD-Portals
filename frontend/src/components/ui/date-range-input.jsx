"use client";

import { useRef } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

export function DateRangeInput({
  id,
  label,
  value,
  onChange,
  min,
  max,
  className,
}) {
  const inputRef = useRef(null);

  function openPicker() {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
    } else {
      input.focus();
    }
  }

  return (
    <div
      className={cn(
        "flex w-[14.5rem] items-center gap-2 rounded-xl border border-border bg-white px-3 py-2.5",
        className
      )}
    >
      <CalendarDays
        className="h-4 w-4 shrink-0 text-muted"
        aria-hidden="true"
      />

      <span className="shrink-0 text-sm text-muted">{label}</span>

      <div className="relative min-w-0 flex-1">
        {!value ? (
          <span
            className="pointer-events-none absolute inset-y-0 left-0 flex items-center text-sm text-ink"
            aria-hidden="true"
          >
            mm/dd/yyyy
          </span>
        ) : null}
        <input
          ref={inputRef}
          id={id}
          type="date"
          value={value}
          min={min || undefined}
          max={max || undefined}
          onChange={onChange}
          aria-label={`${label} date`}
          className={cn(
            "date-range-input w-full min-w-0 border-0 bg-transparent p-0 text-sm text-ink outline-none",
            !value && "date-range-input--empty"
          )}
        />
      </div>

      <button
        type="button"
        aria-label={`Open ${label.toLowerCase()} date picker`}
        onClick={openPicker}
        className="shrink-0 cursor-pointer rounded-md p-0.5 text-ink transition hover:bg-cream-deep"
      >
        <CalendarDays className="h-4 w-4" strokeWidth={2.25} />
      </button>
    </div>
  );
}
