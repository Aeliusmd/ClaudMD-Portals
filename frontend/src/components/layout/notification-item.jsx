import { cn } from "@/lib/utils";

export function NotificationItem({ notification, className }) {
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
          notification.unread ? "bg-[#e11d48]" : "bg-[#d1d5db]"
        )}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="font-sans text-[0.9rem] leading-snug font-medium text-[#1c1917]">
          {notification.message}
        </p>
        <p className="mt-1 font-sans text-[0.8rem] font-normal text-[#9aa0a8]">
          {notification.timeAgo}
        </p>
      </div>
    </div>
  );
}
