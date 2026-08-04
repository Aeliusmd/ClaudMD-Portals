"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { NotificationsCard } from "@/components/layout/notifications-card";
import { notifications as defaultNotifications } from "@/data/notifications";
import { cn } from "@/lib/utils";

export function NotificationsMenu({ items, variant = "soft" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const list = items ?? defaultNotifications;
  const unreadCount = list.filter((item) => item.unread).length;

  useEffect(() => {
    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
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

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((prev) => !prev)}
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

      {open ? <NotificationsCard notifications={list} /> : null}
    </div>
  );
}
