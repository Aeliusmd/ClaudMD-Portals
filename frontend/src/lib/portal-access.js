import { clearAuthSession, getAuthSession } from "@/lib/auth-session";
import { canAccessPortal, portalsAllowedForTypeId } from "@/lib/user-type";
import { getLoginHref } from "@/lib/portal-paths";

/**
 * Ensure the saved session is allowed on this portal shell.
 * Wrong-type sessions (e.g. Patient User on /employerportal) are cleared
 * and sent to the correct portal login.
 *
 * @returns {string|null} login href to redirect to, or null if session is OK
 */
export function portalAccessRedirect(expectedPortal) {
  const expected = String(expectedPortal || "")
    .trim()
    .toLowerCase();
  const session = getAuthSession();
  if (!session?.accessToken) {
    return getLoginHref({ portal: expected });
  }

  const user = session.user || {};
  const typeId = user.type_id;
  const sessionPortal = String(user.portal || "")
    .trim()
    .toLowerCase();

  if (!canAccessPortal(typeId, expected)) {
    clearAuthSession();
    const allowed = portalsAllowedForTypeId(typeId);
    const home = allowed[0] || sessionPortal || expected;
    return getLoginHref({
      portal: home,
      activationKey: user.activation_key || undefined,
    });
  }

  // Session was created on a different portal login URL.
  if (sessionPortal && sessionPortal !== expected) {
    clearAuthSession();
    return getLoginHref({
      portal: sessionPortal,
      activationKey: user.activation_key || undefined,
    });
  }

  return null;
}
