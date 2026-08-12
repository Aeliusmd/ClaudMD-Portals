"use client";

import { cn } from "@/lib/utils";

/** Long document titles wrap cleanly and expose the full name on hover. */
export function DocumentNameText({
  name,
  className,
  title,
}) {
  const label = (name || "Document").trim() || "Document";
  return (
    <p
      title={title || label}
      className={cn(
        "break-words text-balance leading-snug [overflow-wrap:anywhere]",
        className
      )}
    >
      {label}
    </p>
  );
}
