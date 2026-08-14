"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  fetchEmployerNotifications,
  markEmployerNotificationsRead,
} from "@/lib/api/employer";
import { getAccessToken } from "@/lib/auth-session";
import { LOGIN_PATH } from "@/lib/auth-routes";
import {
  applyNotificationReadState,
  countUnreadNotifications,
  getNotificationReadIds,
  markNotificationIdRead,
  pruneNotificationReadIds,
  unreadBeyondLoaded,
} from "@/lib/notification-read-state";
import {
  NOTIFICATIONS_POLL_MS,
  useVisiblePoll,
} from "@/hooks/use-visible-poll";

const PORTAL = "employer";
const BELL_PAGE_SIZE = 50;
// Safety stop when walking pages to clear every unread item.
const MAX_MARK_ALL_PAGES = 20;

let cachedToken = null;
let cachedItems = null;
let cachedUnreadCount = 0;
let cachedTotal = 0;
// Unread items counted by the API that are not in the fetched page.
let cachedBeyondUnread = 0;
let inflightPromise = null;
const listeners = new Set();

function emit() {
  for (const listener of listeners) listener();
}

function setSharedState({ items, unreadCount, total, token }) {
  if (token !== undefined) cachedToken = token;
  if (items !== undefined) cachedItems = items;
  if (unreadCount !== undefined) cachedUnreadCount = unreadCount;
  if (total !== undefined) cachedTotal = total;
  emit();
}

function applyAndStore(rawItems, token, { total, apiUnreadCount } = {}) {
  const raw = rawItems || [];
  if (typeof total === "number" && raw.length >= total) {
    pruneNotificationReadIds(raw, PORTAL);
  }

  const next = applyNotificationReadState(raw, PORTAL);
  cachedBeyondUnread = unreadBeyondLoaded(raw, apiUnreadCount);
  setSharedState({
    items: next,
    unreadCount: countUnreadNotifications(next) + cachedBeyondUnread,
    total: total ?? next.length,
    token,
  });
  return next;
}

export function markEmployerNotificationItemRead(notification) {
  const id = notification?.id;
  if (id == null) return;

  const alreadyStored = getNotificationReadIds(PORTAL).has(String(id));
  markNotificationIdRead(id, PORTAL);

  const wasLoaded = (cachedItems || []).some(
    (item) => String(item.id) === String(id)
  );
  const next = (cachedItems || []).map((item) =>
    String(item.id) === String(id) ? { ...item, unread: false } : item
  );
  // Rows from later pages are only reflected in the API total, never in items.
  if (!alreadyStored && !wasLoaded && notification.unread !== false) {
    cachedBeyondUnread = Math.max(0, cachedBeyondUnread - 1);
  }

  setSharedState({
    items: next,
    unreadCount: countUnreadNotifications(next) + cachedBeyondUnread,
    total: cachedTotal,
    token: getAccessToken(),
  });
}

/**
 * Clear the badge in one action. Unread ids live on later pages too, so walk
 * the list instead of only clearing what the bell has cached.
 */
export async function markAllEmployerNotificationsRead() {
  const token = getAccessToken();
  if (!token) return;

  const unreadIds = new Set();
  for (const item of cachedItems || []) {
    if (item.unread && item.id != null) unreadIds.add(String(item.id));
  }

  try {
    let page = 1;
    let totalPages = 1;
    do {
      const data = await fetchEmployerNotifications(token, {
        page,
        pageSize: BELL_PAGE_SIZE,
      });
      for (const item of data.items || []) {
        if (item.unread && item.id != null) unreadIds.add(String(item.id));
      }
      totalPages = data.totalPages ?? 1;
      page += 1;
    } while (page <= totalPages && page <= MAX_MARK_ALL_PAGES);
  } catch {
    // Keep going with the ids already known from the bell cache.
  }

  for (const id of unreadIds) markNotificationIdRead(id, PORTAL);

  try {
    // Durable IsViewed for shared documents; appointments have no read flag.
    await markEmployerNotificationsRead(token);
  } catch {
    // Client-side read state still hides them.
  }

  const next = (cachedItems || []).map((item) =>
    item.unread ? { ...item, unread: false } : item
  );
  cachedBeyondUnread = 0;
  setSharedState({
    items: next,
    unreadCount: 0,
    total: cachedTotal,
    token,
  });
}

export function useEmployerNotifications({ enabled = true } = {}) {
  const router = useRouter();
  const [items, setItems] = useState(() =>
    enabled && cachedItems ? cachedItems : []
  );
  const [unreadCount, setUnreadCount] = useState(() =>
    enabled ? cachedUnreadCount : 0
  );
  const [total, setTotal] = useState(() => (enabled ? cachedTotal : 0));
  const [loading, setLoading] = useState(
    Boolean(enabled && cachedItems == null)
  );
  const [error, setError] = useState(null);

  useEffect(() => {
    function onChange() {
      setItems(cachedItems || []);
      setUnreadCount(cachedUnreadCount);
      setTotal(cachedTotal);
    }
    listeners.add(onChange);
    return () => listeners.delete(onChange);
  }, []);

  const load = useCallback(
    async ({ silent = false, force = false } = {}) => {
      if (!enabled) return;

      const token = getAccessToken();
      if (!token) {
        router.replace(LOGIN_PATH);
        return;
      }

      if (!force && cachedItems && cachedToken === token) {
        setItems(cachedItems);
        setUnreadCount(cachedUnreadCount);
        setTotal(cachedTotal);
        setLoading(false);
        setError(null);
        return;
      }

      if (!silent) setLoading(true);

      try {
        cachedToken = token;
        inflightPromise = fetchEmployerNotifications(token, {
          page: 1,
          pageSize: BELL_PAGE_SIZE,
        });
        const data = await inflightPromise;
        applyAndStore(data.items || [], token, {
          total: data.total,
          apiUnreadCount: data.unreadCount,
        });
        setError(null);
      } catch (err) {
        inflightPromise = null;
        if (err?.status === 401) {
          cachedItems = null;
          cachedToken = null;
          router.replace(LOGIN_PATH);
          return;
        }
        if (!silent) {
          setError(err?.message || "Unable to load notifications.");
          setSharedState({ items: [], unreadCount: 0, total: 0 });
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [enabled, router]
  );

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      setUnreadCount(0);
      setTotal(0);
      setLoading(false);
      setError(null);
      return undefined;
    }

    load({ silent: false, force: false });
    return undefined;
  }, [enabled, load]);

  useVisiblePoll(
    useCallback(
      async () => {
        if (!enabled) return;
        await load({ silent: true, force: true });
      },
      [enabled, load]
    ),
    NOTIFICATIONS_POLL_MS,
    { immediate: false }
  );

  return {
    items,
    unreadCount,
    total,
    loading,
    error,
  };
}
