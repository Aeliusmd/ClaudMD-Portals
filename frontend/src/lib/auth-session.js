const AUTH_STORAGE_KEY = "claudmd.authSession";

export function saveAuthSession(session) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function getAuthSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearAuthSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function getAccessToken() {
  return getAuthSession()?.accessToken || null;
}

export function getAuthHeader() {
  const session = getAuthSession();
  if (!session?.accessToken) return {};
  const type = session.tokenType || "Bearer";
  return { Authorization: `${type} ${session.accessToken}` };
}
