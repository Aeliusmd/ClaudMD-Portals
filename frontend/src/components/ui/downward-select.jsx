"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Custom select that always opens the menu downward (avoids native select
 * flipping upward when space below a modal is tight).
 */
export function DownwardSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "Select...",
  error = false,
  className,
  disabled = false,
}) {
  const listId = useId();
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);

  const selected = options.find((opt) => opt.value === value) || null;

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }

    function onKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={cn("relative", className)} ref={rootRef}>
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border bg-white px-3.5 py-2.5 text-left text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60",
          error ? "border-rose-400" : "border-border",
          selected ? "text-ink" : "text-muted"
        )}
      >
        <span className="truncate">
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted transition",
            open && "rotate-180"
          )}
        />
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-[100] mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-white py-1 shadow-lg"
        >
          {placeholder ? (
            <li>
              <button
                type="button"
                role="option"
                aria-selected={!value}
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full cursor-pointer px-3.5 py-2.5 text-left text-sm transition hover:bg-cream",
                  !value ? "bg-sky-50 font-semibold text-primary" : "text-muted"
                )}
              >
                {placeholder}
              </button>
            </li>
          ) : null}
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <li key={opt.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full cursor-pointer px-3.5 py-2.5 text-left text-sm transition hover:bg-cream",
                    active
                      ? "bg-sky-50 font-semibold text-primary"
                      : "text-ink"
                  )}
                >
                  {opt.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
