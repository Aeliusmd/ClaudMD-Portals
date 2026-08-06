"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { NotificationItem } from "@/components/layout/notification-item";

export function NotificationsCard({
  notifications,
  previewLimit = 3,
  viewAllHref,
  onNavigate,
  totalCount,
}) {
  const list = notifications || [];
  const preview = list.slice(0, previewLimit);
  const fullTotal = totalCount != null ? totalCount : list.length;
  const remaining = Math.max(fullTotal - preview.length, 0);
  const showViewAll = Boolean(viewAllHref);

  return (
    <div
      role="dialog"
      aria-label="Notifications"
      className="absolute top-[calc(100%+0.65rem)] right-0 z-50 w-[22rem] overflow-hidden rounded-2xl border border-[#ece7df] bg-white shadow-[0_12px_40px_rgba(28,36,48,0.12)]"
    >
      <div className="border-b border-[#f0ebe3] px-5 py-4">
        <h2 className="font-display text-[1.35rem] font-bold text-[#1c1917]">
          Notifications
        </h2>
        <p className="mt-1 font-sans text-[0.8rem] text-[#9aa0a8]">
          Showing your latest updates
        </p>
      </div>

      <div className="divide-y divide-[#f0ebe3] py-1">
        {preview.length === 0 ? (
          <p className="px-5 py-6 font-sans text-sm text-[#9aa0a8]">
            No notifications right now.
          </p>
        ) : (
          preview.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
            />
          ))
        )}
      </div>

      {showViewAll ? (
        <div className="border-t border-[#f0ebe3] bg-[#faf8f5] p-3">
          <Link
            href={viewAllHref}
            onClick={onNavigate}
            className="group flex items-center justify-between gap-3 rounded-xl border border-[#ece7df] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(28,36,48,0.04)] transition hover:border-[#ddd6cb] hover:bg-[#fffdfb]"
          >
            <div className="min-w-0">
              <p className="font-sans text-sm font-semibold text-[#1c1917]">
                View all notifications
              </p>
              <p className="mt-0.5 font-sans text-[0.75rem] text-[#9aa0a8]">
                {fullTotal > 0
                  ? remaining > 0
                    ? `${remaining} more from the last 30 days`
                    : "Open the full notification list"
                  : "See activity from the last 30 days"}
              </p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cream-deep text-[#6b7280] transition group-hover:bg-[#e8dfd2] group-hover:text-ink">
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
            </span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
