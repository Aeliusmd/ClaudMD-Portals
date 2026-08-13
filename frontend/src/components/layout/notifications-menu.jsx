"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell } from "lucide-react";
import { NotificationsCard } from "@/components/layout/notifications-card";
import { notifications as defaultNotifications } from "@/data/notifications";
import { cn } from "@/lib/utils";

const PREVIEW_LIMIT = 3;
const PANEL_WIDTH_PX = 352; // ~22rem

export function NotificationsMenu({
  items,
  variant = "soft",
  viewAllHref,
  onOpen,
  previewLimit = PREVIEW_LIMIT,
  totalCount,
  unreadCount: unreadCountProp,
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [panelStyle, setPanelStyle] = useState(null);
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const markedOnOpenRef = useRef(false);
  const list = items ?? defaultNotifications;
  const unreadCount =
    unreadCountProp != null
      ? unreadCountProp
      : list.filter((item) => item.unread).length;

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPanelStyle(null);
      return undefined;
    }

    function updatePosition() {
      const button = rootRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const gap = 10;
      const width = Math.min(PANEL_WIDTH_PX, window.innerWidth - 16);
      let left = rect.right - width;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      setPanelStyle({
        position: "fixed",
        top: rect.bottom + gap,
        left,
        width,
        zIndex: 80,
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    function handlePointerDown(event) {
      const target = event.target;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }

    function handleEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      markedOnOpenRef.current = false;
      return;
    }
    if (markedOnOpenRef.current) return;
    markedOnOpenRef.current = true;
    onOpen?.();
  }, [open, onOpen]);

  function handleToggle() {
    setOpen((prev) => {
      const next = !prev;
      if (next && !markedOnOpenRef.current) {
        markedOnOpenRef.current = true;
        onOpen?.();
      }
      return next;
    });
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={handleToggle}
        className={cn(
          "relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-[#6b7280] transition hover:text-ink",
          variant === "soft"
            ? "bg-cream-deep hover:bg-[#e8dfd2]"
            : "hover:bg-cream-deep"
        )}
      >
        <Bell className="h-5 w-5" strokeWidth={1.75} />
        {unreadCount > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {unreadCount}
          </span>
        ) : null}
      </button>

      {mounted && open && panelStyle
        ? createPortal(
            <div ref={panelRef} style={panelStyle}>
              <NotificationsCard
                notifications={list}
                previewLimit={previewLimit}
                viewAllHref={viewAllHref}
                totalCount={totalCount}
                onNavigate={() => setOpen(false)}
                className="w-full"
              />
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
