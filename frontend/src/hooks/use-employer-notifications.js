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
  getNotificationsLastOpenedAt,
  setNotificationsLastOpenedAt,
} from "@/lib/notification-read-state";

let cachedToken = null;
let cachedItems = null;
let cachedUnreadCount = 0;
let cachedTotal = 0;
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

function applyAndStore(rawItems, openedAt, token, { total, apiUnreadCount } = {}) {
  const next = applyNotificationReadState(rawItems || [], openedAt);
  // Prefer API unread_count (all pages) until the user has opened the bell;
  // after that, derive from applied items so lastOpenedAt clears the badge.
  const computedUnread = openedAt
    ? countUnreadNotifications(next)
    : typeof apiUnreadCount === "number"
      ? apiUnreadCount
      : countUnreadNotifications(next);
  setSharedState({
    items: next,
    unreadCount: computedUnread,
    total: total ?? next.length,
    token,
  });
  return next;
}

/** Bell dropdown: loads first page (10) for preview of 3 + unread badge. */
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

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      setUnreadCount(0);
      setTotal(0);
      setLoading(false);
      setError(null);
      return undefined;
    }

    let cancelled = false;

    async function load() {
      const token = getAccessToken();
      if (!token) {
        router.replace(LOGIN_PATH);
        return;
      }

      // On full page refresh module cache is empty; always fetch.
      // Within SPA navigation, reuse cache for the same token.
      if (cachedItems && cachedToken === token) {
        if (!cancelled) {
          setItems(cachedItems);
          setUnreadCount(cachedUnreadCount);
          setTotal(cachedTotal);
          setLoading(false);
          setError(null);
        }
        return;
      }

      if (!cancelled) setLoading(true);

      try {
        if (!inflightPromise || cachedToken !== token) {
          cachedToken = token;
          inflightPromise = fetchEmployerNotifications(token, {
            page: 1,
            pageSize: 10,
          });
        }
        const data = await inflightPromise;
        if (cancelled) return;
        const openedAt = getNotificationsLastOpenedAt();
        applyAndStore(data.items || [], openedAt, token, {
          total: data.total,
          apiUnreadCount: data.unreadCount,
        });
        setError(null);
      } catch (err) {
        inflightPromise = null;
        if (cancelled) return;
        if (err?.status === 401) {
          cachedItems = null;
          cachedToken = null;
          router.replace(LOGIN_PATH);
          return;
        }
        setError(err?.message || "Unable to load notifications.");
        setSharedState({ items: [], unreadCount: 0, total: 0 });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [enabled, router]);

  const markAsRead = useCallback(async () => {
    if (!enabled) return;
    const token = getAccessToken();
    if (!token) return;

    setNotificationsLastOpenedAt(new Date().toISOString(), "employer");
    const cleared = (cachedItems || []).map((item) => ({
      ...item,
      unread: false,
    }));
    setSharedState({
      items: cleared,
      unreadCount: 0,
      total: cachedTotal,
      token,
    });

    try {
      await markEmployerNotificationsRead(token);
    } catch (err) {
      if (err?.status === 401) {
        router.replace(LOGIN_PATH);
      }
      // Keep optimistic clear + lastOpenedAt even if mark-read API fails.
    }
  }, [enabled, router]);

  return {
    items,
    unreadCount,
    total,
    loading,
    error,
    markAsRead,
  };
}
