"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const PAGE_SIZE = 10;

export function paginateItems(items, page, pageSize = PAGE_SIZE) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;

  return {
    items: items.slice(start, end),
    currentPage,
    totalPages,
    total,
    start: total === 0 ? 0 : start + 1,
    end: Math.min(end, total),
  };
}

export function Pagination({
  page,
  totalPages,
  total,
  start,
  end,
  onChange,
  className,
  alwaysShow = false,
}) {
  if (!alwaysShow && totalPages <= 1) return null;
  if (total === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-t border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <p className="text-sm text-muted">
        Showing {start}–{end} of {total}
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-cream disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </button>

        <span className="min-w-20 text-center text-sm font-medium text-ink">
          Page {page} of {totalPages}
        </span>

        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-cream disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
