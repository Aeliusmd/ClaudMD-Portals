const READ_IDS_KEYS = {
  employer: "employer.notifications.readIds",
  insurance: "insurance.notifications.readIds",
  patient: "patient.notifications.readIds",
};

const memoryReadIds = {
  employer: new Set(),
  insurance: new Set(),
  patient: new Set(),
};

const hydrated = {
  employer: false,
  insurance: false,
  patient: false,
};

function portalKey(portal = "employer") {
  return READ_IDS_KEYS[portal] ? portal : "employer";
}

function hydrateReadIds(portal) {
  if (hydrated[portal] || typeof window === "undefined") return;
  hydrated[portal] = true;
  try {
    const raw = window.localStorage.getItem(READ_IDS_KEYS[portal]);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    for (const id of parsed) {
      const value = String(id || "").trim();
      if (value) memoryReadIds[portal].add(value);
    }
  } catch {
    // ignore unreadable / private-mode storage
  }
}

function persistReadIds(portal) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      READ_IDS_KEYS[portal],
      JSON.stringify(Array.from(memoryReadIds[portal]))
    );
  } catch {
    // ignore quota / private mode
  }
}

export function getNotificationReadIds(portal = "employer") {
  const key = portalKey(portal);
  hydrateReadIds(key);
  return new Set(memoryReadIds[key]);
}

export function markNotificationIdRead(id, portal = "employer") {
  const key = portalKey(portal);
  const value = String(id ?? "").trim();
  hydrateReadIds(key);
  if (!value) return new Set(memoryReadIds[key]);
  memoryReadIds[key].add(value);
  persistReadIds(key);
  return new Set(memoryReadIds[key]);
}

/**
 * Forget clicked ids that the server no longer returns (aged past the 30-day
 * window). Only safe when `items` is the complete list, otherwise ids from
 * later pages would be resurrected as unread.
 */
export function pruneNotificationReadIds(items, portal = "employer") {
  const key = portalKey(portal);
  hydrateReadIds(key);
  if (!Array.isArray(items) || memoryReadIds[key].size === 0) return;

  const alive = new Set(
    items.map((item) => (item?.id == null ? "" : String(item.id)))
  );
  let changed = false;
  for (const id of Array.from(memoryReadIds[key])) {
    if (!alive.has(id)) {
      memoryReadIds[key].delete(id);
      changed = true;
    }
  }
  if (changed) persistReadIds(key);
}

/** New items stay unread until that row is clicked. */
export function applyNotificationReadState(items, portal = "employer") {
  if (!Array.isArray(items)) return [];
  const readIds = getNotificationReadIds(portal);
  return items.map((item) => {
    if (!item.unread) return item;
    if (item.id != null && readIds.has(String(item.id))) {
      return { ...item, unread: false };
    }
    return item;
  });
}

export function countUnreadNotifications(items) {
  if (!Array.isArray(items)) return 0;
  return items.filter((item) => item.unread).length;
}

/**
 * Unread items the server counted but that are not on the fetched page, so the
 * badge can stay accurate without loading every notification.
 */
export function unreadBeyondLoaded(rawItems, apiUnreadCount) {
  if (typeof apiUnreadCount !== "number") return 0;
  return Math.max(0, apiUnreadCount - countUnreadNotifications(rawItems));
}
