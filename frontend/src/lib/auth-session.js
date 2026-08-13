import { displayFullName } from "@/lib/profile-display";

const AUTH_STORAGE_KEY = "claudmd.authSession";
const AUTH_SESSION_EVENT = "claudmd-auth-session-changed";

function emitAuthSessionChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AUTH_SESSION_EVENT));
}

export function saveAuthSession(session) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  emitAuthSessionChanged();
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
  emitAuthSessionChanged();
}

/** Keep the logged-in header name in sync after Profile save. */
export function updateAuthSessionUser(profile) {
  const session = getAuthSession();
  if (!session?.user || !profile) return;

  const fullName = displayFullName(profile);
  const firstName =
    String(profile.firstName || profile.first_name || "").trim() || null;
  const lastName =
    String(profile.lastName || profile.last_name || "").trim() || null;

  saveAuthSession({
    ...session,
    user: {
      ...session.user,
      first_name: firstName ?? session.user.first_name,
      last_name: lastName ?? session.user.last_name,
      name: fullName || session.user.name,
      email: profile.email ?? session.user.email,
    },
  });
}

export function subscribeAuthSession(listener) {
  if (typeof window === "undefined") return () => {};
  const onChange = () => listener();
  window.addEventListener(AUTH_SESSION_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(AUTH_SESSION_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function markPasswordChanged() {
  const session = getAuthSession();
  if (!session?.user) return;
  saveAuthSession({
    ...session,
    user: {
      ...session.user,
      must_change_password: false,
      mustChangePassword: false,
    },
  });
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
