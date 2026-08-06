const STORAGE_KEY = "employer.notifications.lastOpenedAt";

export function getNotificationsLastOpenedAt() {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export function setNotificationsLastOpenedAt(iso = new Date().toISOString()) {
  if (typeof window === "undefined") return iso;
  try {
    window.localStorage.setItem(STORAGE_KEY, iso);
  } catch {
    // ignore quota / private mode
  }
  return iso;
}

/**
 * After the user opens the bell / View all, items created at or before
 * lastOpenedAt are treated as read so the badge stays cleared across refresh.
 * SharedDocuments also use IsViewed from the API; lastOpenedAt is the fallback.
 */
export function applyNotificationReadState(items, lastOpenedAt) {
  if (!Array.isArray(items)) return [];
  if (!lastOpenedAt) return items;

  const opened = Date.parse(lastOpenedAt);
  if (Number.isNaN(opened)) return items;

  return items.map((item) => {
    if (!item.unread) return item;
    if (!item.createdAt) {
      return { ...item, unread: false };
    }
    const created = Date.parse(item.createdAt);
    if (Number.isNaN(created) || created <= opened) {
      return { ...item, unread: false };
    }
    return item;
  });
}

export function countUnreadNotifications(items) {
  if (!Array.isArray(items)) return 0;
  return items.filter((item) => item.unread).length;
}
