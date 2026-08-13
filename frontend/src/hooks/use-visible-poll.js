"use client";

import { useEffect, useRef } from "react";

/** How often dashboard KPI counts (including Unread Reports) refresh while the tab is open. */
export const DASHBOARD_SUMMARY_POLL_MS = 20_000;

/**
 * Run `load({ silent })` on mount (unless `immediate` is false), then every
 * `intervalMs` while the browser tab is visible, and again when the user
 * returns to the tab. Later calls are silent (no skeleton).
 */
export function useVisiblePoll(
  load,
  intervalMs = DASHBOARD_SUMMARY_POLL_MS,
  { immediate = true } = {}
) {
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;

    async function run(silent) {
      if (cancelled) return;
      await loadRef.current({ silent });
    }

    if (immediate) run(false);

    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") run(true);
    }, intervalMs);

    function onVisibility() {
      if (document.visibilityState === "visible") run(true);
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, immediate]);
}
