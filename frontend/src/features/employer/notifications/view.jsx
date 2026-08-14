"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PAGE_SIZE, Pagination } from "@/components/ui/pagination";
import { SkeletonBlock } from "@/components/ui/skeleton";
import { NotificationItem } from "@/components/layout/notification-item";
import {
  fetchEmployerNotifications,
} from "@/lib/api/employer";
import { getAccessToken } from "@/lib/auth-session";
import { LOGIN_PATH } from "@/lib/auth-routes";
import { employerPaths } from "@/lib/portal-paths";
import {
  markAllEmployerNotificationsRead,
  markEmployerNotificationItemRead,
} from "@/hooks/use-employer-notifications";
import { applyNotificationReadState } from "@/lib/notification-read-state";
import { cn } from "@/lib/utils";

function NotificationRowSkeleton({ wide = false }) {
  return (
    <div className="flex items-start gap-3 px-5 py-3.5" aria-hidden="true">
      <SkeletonBlock className="mt-1.5 h-2 w-2 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <SkeletonBlock className={cn("h-4", wide ? "w-[92%]" : "w-[78%]")} />
        <SkeletonBlock className="h-3 w-24" />
      </div>
    </div>
  );
}

function NotificationsListSkeleton({ rows = PAGE_SIZE, showHeader = true }) {
  return (
    <Card
      className="overflow-hidden p-0 shadow-[0_8px_30px_rgba(28,36,48,0.06)]"
      aria-busy="true"
      aria-label="Loading notifications"
    >
      {showHeader ? (
        <div className="border-b border-[#f0ebe3] bg-[#faf8f5] px-5 py-4">
          <SkeletonBlock className="h-4 w-36" />
          <SkeletonBlock className="mt-2 h-3 w-56" />
        </div>
      ) : null}
      <div className="divide-y divide-[#f0ebe3]">
        {Array.from({ length: rows }).map((_, index) => (
          <NotificationRowSkeleton key={index} wide={index % 2 === 0} />
        ))}
      </div>
    </Card>
  );
}

export function EmployerNotificationsView() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);
  const hasLoadedRef = useRef(false);

  const markItemAsRead = useCallback((notification) => {
    const id = notification?.id;
    if (id == null || notification.unread === false) return;
    markEmployerNotificationItemRead(notification);
    setItems((prev) =>
      prev.map((item) =>
        String(item.id) === String(id) ? { ...item, unread: false } : item
      )
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const loadPage = useCallback(
    async (nextPage) => {
      const token = getAccessToken();
      if (!token) {
        router.replace(LOGIN_PATH);
        return;
      }

      setLoading(true);
      try {
        const data = await fetchEmployerNotifications(token, {
          page: nextPage,
          pageSize: PAGE_SIZE,
        });
        const mapped = applyNotificationReadState(
          data.items || [],
          "employer"
        );
        setItems(mapped);
        setTotal(data.total ?? 0);
        setUnreadCount(data.unreadCount ?? 0);
        setTotalPages(data.totalPages ?? 1);
        setDays(data.days ?? 30);
        setPage(data.page ?? nextPage);
        setError(null);
        hasLoadedRef.current = true;
        setHasLoaded(true);
      } catch (err) {
        if (err?.status === 401) {
          router.replace(LOGIN_PATH);
          return;
        }
        setError(err?.message || "Unable to load notifications.");
        if (!hasLoadedRef.current) {
          setItems([]);
          setTotal(0);
          setTotalPages(1);
        }
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  useEffect(() => {
    void loadPage(page);
  }, [loadPage, page]);

  const markAllAsRead = useCallback(async () => {
    setMarkingAll(true);
    try {
      await markAllEmployerNotificationsRead();
      setItems((prev) =>
        prev.map((item) => (item.unread ? { ...item, unread: false } : item))
      );
      setUnreadCount(0);
    } finally {
      setMarkingAll(false);
    }
  }, []);

  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);
  const showInitialSkeleton = loading && !hasLoaded;
  const showPageSkeleton = loading && hasLoaded;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <button
        type="button"
        onClick={() => router.push(employerPaths.dashboard)}
        className="cursor-pointer text-sm font-semibold text-primary-500 transition hover:text-primary-600"
      >
        ← Back to dashboard
      </button>

      <PageHeader
        title="Notifications"
        description={
          showInitialSkeleton
            ? "Loading recent activity…"
            : `Activity from the last ${days} days · ${unreadCount} unread`
        }
        actions={
          hasLoaded && unreadCount > 0 ? (
            <button
              type="button"
              onClick={markAllAsRead}
              disabled={markingAll}
              className="shrink-0 cursor-pointer rounded-xl border border-[#ece7df] bg-white px-4 py-2.5 font-sans text-sm font-semibold text-[#8B6D4F] transition hover:border-[#ddd6cb] hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
            >
              {markingAll ? "Marking…" : "Mark all as read"}
            </button>
          ) : null
        }
      />

      {showInitialSkeleton ? (
        <div className="space-y-5">
          <NotificationsListSkeleton rows={PAGE_SIZE} />
          <div className="flex justify-center gap-2" aria-hidden="true">
            <SkeletonBlock className="h-9 w-24 rounded-lg" />
            <SkeletonBlock className="h-9 w-9 rounded-lg" />
            <SkeletonBlock className="h-9 w-9 rounded-lg" />
            <SkeletonBlock className="h-9 w-24 rounded-lg" />
          </div>
        </div>
      ) : error && !hasLoaded ? (
        <EmptyState
          icon={Bell}
          title="Unable to load notifications"
          description={error}
        />
      ) : !loading && items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="You're all caught up"
          description="New shared reports, appointments, and work status updates will appear here."
        />
      ) : (
        <>
          {error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
              {error}
            </p>
          ) : null}

          <Card className="overflow-hidden p-0 shadow-[0_8px_30px_rgba(28,36,48,0.06)]">
            <div className="border-b border-[#f0ebe3] bg-[#faf8f5] px-5 py-4">
              <p className="font-sans text-sm font-semibold text-[#1c1917]">
                All notifications
              </p>
              <p className="mt-0.5 font-sans text-[0.8rem] text-[#9aa0a8]">
                {showPageSkeleton
                  ? "Loading page…"
                  : `Showing ${start}–${end} of ${total} from the last ${days} days`}
              </p>
            </div>

            {showPageSkeleton ? (
              <div
                className="divide-y divide-[#f0ebe3]"
                aria-busy="true"
                aria-label="Loading notifications page"
              >
                {Array.from({ length: Math.min(PAGE_SIZE, total || PAGE_SIZE) }).map(
                  (_, index) => (
                    <NotificationRowSkeleton
                      key={index}
                      wide={index % 2 === 0}
                    />
                  )
                )}
              </div>
            ) : (
              <div className="divide-y divide-[#f0ebe3]">
                {items.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onMarkRead={markItemAsRead}
                  />
                ))}
              </div>
            )}
          </Card>

          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            start={start}
            end={end}
            onChange={setPage}
            alwaysShow
          />
        </>
      )}
    </div>
  );
}
