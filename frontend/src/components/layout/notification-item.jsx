import { cn } from "@/lib/utils";

export function NotificationItem({ notification, className, onMarkRead }) {
  const unread = Boolean(notification.unread);
  const canMark = unread && typeof onMarkRead === "function";

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-5 py-3.5 transition",
        unread
          ? "bg-primary-50/80 hover:bg-primary-50"
          : "bg-white hover:bg-[#faf8f5]",
        className
      )}
      data-unread={unread ? "true" : "false"}
    >
      <span
        className={cn(
          "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
          unread
            ? "bg-primary shadow-[0_0_0_3px_rgba(139,109,79,0.18)]"
            : "bg-[#d1d5db]"
        )}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "font-sans text-[0.9rem] leading-snug text-[#1c1917]",
            unread ? "font-bold" : "font-medium text-[#57534e]"
          )}
        >
          {unread ? <span className="sr-only">Unread. </span> : null}
          {notification.message}
        </p>
        <p
          className={cn(
            "mt-1 font-sans text-[0.8rem] font-normal",
            unread ? "text-[#8B6D4F]" : "text-[#9aa0a8]"
          )}
        >
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
