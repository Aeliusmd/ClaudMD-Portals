import { cn } from "@/lib/utils";

export function NotificationItem({ notification, className, onMarkRead }) {
  const unread = Boolean(notification.unread);
  const canMark = unread && typeof onMarkRead === "function";

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-5 py-3.5 transition hover:bg-[#faf8f5]",
        className
      )}
    >
      <span
        className={cn(
          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
          unread ? "bg-[#e11d48]" : "bg-[#d1d5db]"
        )}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="font-sans text-[0.9rem] leading-snug font-medium text-[#1c1917]">
          {notification.message}
        </p>
        <p className="mt-1 font-sans text-[0.8rem] font-normal text-[#9aa0a8]">
          {notification.timeAgo}
        </p>
      </div>
      {canMark ? (
        <button
          type="button"
          onClick={() => onMarkRead(notification)}
          className="mt-0.5 shrink-0 cursor-pointer rounded-lg border border-[#ece7df] bg-white px-2.5 py-1 font-sans text-[0.75rem] font-semibold text-[#8B6D4F] transition hover:border-[#ddd6cb] hover:text-ink"
        >
          Mark as read
        </button>
      ) : null}
    </div>
  );
}
