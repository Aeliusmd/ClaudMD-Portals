"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { NotificationsCard } from "@/components/layout/notifications-card";
import { notifications as defaultNotifications } from "@/data/notifications";

export function NotificationsMenu({ items }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const list = items ?? defaultNotifications;
  const hasUnread = list.some((item) => item.unread);

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
        className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-cream-deep text-[#5b6470] transition hover:bg-[#e8dfd2] hover:text-ink"
      >
        <Bell className="h-5 w-5" />
        {hasUnread ? (
          <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-[#e11d48] ring-2 ring-cream-deep" />
        ) : null}
      </button>

      {open ? <NotificationsCard notifications={list} /> : null}
    </div>
  );
}
