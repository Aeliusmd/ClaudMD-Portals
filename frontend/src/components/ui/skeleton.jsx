"use client";

import { cn } from "@/lib/utils";

export function SkeletonBlock({ className }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-md bg-foreground-900/10", className)}
    />
  );
}

export function TableSkeleton({
  columns = 5,
  rows = 5,
  minWidthClass = "min-w-[40rem]",
  headers = null,
}) {
  const headerCells = headers || Array.from({ length: columns }).map(() => "");

  return (
    <div className="overflow-x-auto" aria-busy="true" aria-label="Loading table">
      <table className={cn("w-full text-left text-sm", minWidthClass)}>
        <thead className="border-y border-border/70 bg-cream/50 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
          <tr>
            {headerCells.map((label, index) => (
              <th key={index} className="px-4 py-3 sm:px-5">
                {label || <SkeletonBlock className="h-3 w-16" />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex} className="bg-white">
              {Array.from({ length: headerCells.length }).map((__, cellIndex) => (
                <td key={cellIndex} className="px-4 py-3.5 sm:px-5 sm:py-4">
                  <SkeletonBlock className="h-4 w-full max-w-[8rem]" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function KpiSkeletonStrip({ count = 5 }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-primary-800 text-white shadow-sm">
      <div className="grid grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: count }).map((_, index) => {
          const isTopRowMobile = index < 3;
          const isNotLastInRowMobile = index % 3 !== 2;
          const isNotLastDesktop = index < count - 1;
          return (
            <div
              key={index}
              className={cn(
                "px-3 py-4 text-center sm:px-4 sm:py-5 lg:px-5",
                isTopRowMobile && "border-b border-white/10 lg:border-b-0",
                isNotLastInRowMobile && "border-r border-white/10 lg:border-r-0",
                isNotLastDesktop && "lg:border-r lg:border-white/10"
              )}
            >
              <div className="mx-auto h-3 w-16 animate-pulse rounded bg-white/25" />
              <div className="mx-auto mt-3 h-10 w-12 animate-pulse rounded-md bg-white/25 sm:h-12 sm:w-14" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
