/**
 * Client-side session for secure shared-document links.
 * Supports:
 * - live `sharedid` UUID from ClaudMD email links
 * - legacy Epic 4 mock `share` tokens
 * Stored in sessionStorage so normal tabs stay independent.
 */

import { getLoginHref } from "@/lib/auth-routes";
import {
  employerPaths,
  insurancePaths,
  patientPaths,
} from "@/lib/portal-paths";

const STORAGE_KEY = "claudmd.secureShareSession";

function canUseStorage() {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

function normalizeRecipientRole(role) {
  const value = String(role || "")
    .trim()
    .toLowerCase();
  if (value === "insurance" || value === "patient") return value;
  return "employer";
}

export function saveSecureShareSession(share) {
  if (!canUseStorage() || !share) return;
  const sharedId = (share.sharedId || share.sharedid || "").trim();
  const token = (share.token || "").trim();
  if (!sharedId && !token) return;

  const payload = {
    mode: sharedId ? "live" : "mock",
    sharedId: sharedId || undefined,
    token: token || undefined,
    sharedDocumentId: share.sharedDocumentId,
    employeeId: share.employeeId,
    recipientEmail: share.recipientEmail,
    recipientRole: normalizeRecipientRole(share.recipientRole),
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
    const sharedId = (parsed?.sharedId || "").trim();
    const token = (parsed?.token || "").trim();
    if (!sharedId && !token) return null;
    return {
      ...parsed,
      mode: sharedId ? "live" : "mock",
      sharedId: sharedId || undefined,
      token: token || undefined,
      recipientRole: normalizeRecipientRole(parsed?.recipientRole),
    };
  } catch {
    return null;
  }
}

export function clearSecureShareSession() {
  if (!canUseStorage()) return;
  sessionStorage.removeItem(STORAGE_KEY);
}

export function hasLiveSharedIdSession(session = getSecureShareSession()) {
  return Boolean(session?.sharedId);
}

export function getSecureShareLoginHref(tokenOrOptions, maybeOptions) {
  if (typeof tokenOrOptions === "string") {
    return getLoginHref({
      share: tokenOrOptions,
      ...(maybeOptions || {}),
    });
  }
  return getLoginHref({
    share: tokenOrOptions?.token,
    sharedId: tokenOrOptions?.sharedId,
    activationKey: tokenOrOptions?.activationKey,
    portal: tokenOrOptions?.portal || tokenOrOptions?.recipientRole,
  });
}

export function getSecureShareScopedHref(roleOrSession) {
  const role =
    typeof roleOrSession === "string"
      ? normalizeRecipientRole(roleOrSession)
      : normalizeRecipientRole(roleOrSession?.recipientRole);
  if (role === "insurance") return insurancePaths.sharedDocumentsScoped;
  if (role === "patient") return patientPaths.sharedDocumentsScoped;
  return employerPaths.sharedDocumentsScoped;
}

/**
 * Resolve post-login destination.
 * Live sharedid links enter the portal-scoped view after login.
 * Mock share tokens still require the demo recipient email (employer).
 */
export function resolvePostLoginDestination({
  email,
  defaultDestination,
  shareSession,
  isShareExpired,
}) {
  if (!shareSession || isShareExpired) {
    return defaultDestination;
  }

  if (shareSession.sharedId) {
    return getSecureShareScopedHref(shareSession);
  }

  const normalized = (email || "").trim().toLowerCase();
  if (
    shareSession.recipientRole === "employer" &&
    shareSession.recipientEmail === normalized &&
    normalized === "employer@demo.com"
  ) {
    return getSecureShareScopedHref("employer");
  }

  return defaultDestination;
}
