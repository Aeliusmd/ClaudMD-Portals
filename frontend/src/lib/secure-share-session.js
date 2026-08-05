/**
 * Client-side session for Epic 4 secure email links.
 * Stored in sessionStorage so normal browser tabs / logins stay independent,
 * and closing the tab ends the scoped session.
 */

const STORAGE_KEY = "claudmd.secureShareSession";

function canUseStorage() {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

export function saveSecureShareSession(share) {
  if (!canUseStorage() || !share?.token) return;
  const payload = {
    token: share.token,
    sharedDocumentId: share.sharedDocumentId,
    employeeId: share.employeeId,
    recipientEmail: share.recipientEmail,
    recipientRole: share.recipientRole,
    patientName: share.patientName,
    reportType: share.reportType,
    visitLabel: share.visitLabel,
    visitDate: share.visitDate,
    expiresAt: share.expiresAt,
  };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function getSecureShareSession() {
  if (!canUseStorage()) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSecureShareSession() {
  if (!canUseStorage()) return;
  sessionStorage.removeItem(STORAGE_KEY);
}

import { getLoginHref } from "@/lib/auth-routes";

export function getSecureShareLoginHref(token) {
  return getLoginHref({ share: token });
}

export function getSecureShareScopedHref() {
  return "/employer/shared-documents/scoped";
}

/**
 * Resolve post-login destination.
 * Only employer accounts with a matching active share enter the scoped view.
 */
export function resolvePostLoginDestination({
  email,
  defaultDestination,
  shareSession,
  isShareExpired,
}) {
  const normalized = (email || "").trim().toLowerCase();

  if (
    shareSession &&
    !isShareExpired &&
    shareSession.recipientRole === "employer" &&
    shareSession.recipientEmail === normalized &&
    normalized === "employer@demo.com"
  ) {
    return getSecureShareScopedHref();
  }

  return defaultDestination;
}
