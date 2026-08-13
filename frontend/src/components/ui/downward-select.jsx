"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Custom select that always opens the menu downward (avoids native select
 * flipping upward when space below a modal is tight).
 *
 * Optional `searchable` filters options by label inside the open menu.
 * Default behavior is unchanged when searchable is false/omitted.
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
  searchable = false,
  searchPlaceholder = "Search...",
}) {
  const listId = useId();
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((opt) => opt.value === value) || null;

  const filteredOptions = useMemo(() => {
    if (!searchable) return options;
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((opt) =>
      String(opt.label || "")
        .toLowerCase()
        .includes(normalized)
    );
  }, [options, query, searchable]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return undefined;
    }

    if (searchable) {
      // Focus search after open so typing filters immediately.
      const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [open, searchable]);

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
        <div className="absolute top-full right-0 left-0 z-[100] mt-1 overflow-hidden rounded-lg border border-border bg-white shadow-lg">
          {searchable ? (
            <div className="border-b border-border/70 p-2">
              <label className="relative block">
                <span className="sr-only">Search options</span>
                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    // Keep typing from closing the menu / submitting parent forms.
                    event.stopPropagation();
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setOpen(false);
                    }
                  }}
                  placeholder={searchPlaceholder}
                  className="w-full rounded-md border border-border/80 bg-white py-2 pr-3 pl-8 text-sm text-ink outline-none placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </label>
            </div>
          ) : null}
          <ul
            id={listId}
            role="listbox"
            className="max-h-56 overflow-y-auto py-1"
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
            {filteredOptions.length === 0 ? (
              <li className="px-3.5 py-2.5 text-sm text-muted">
                No matches found.
              </li>
            ) : (
              filteredOptions.map((opt) => {
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
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
