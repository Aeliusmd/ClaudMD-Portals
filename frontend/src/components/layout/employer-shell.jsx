"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import {
  employerNavItems,
  employerScopedShareNavItems,
} from "@/data/navigation";
import {
  findSecureShare,
  isSecureShareExpired,
} from "@/data/secure-shares";
import { useEmployerNotifications } from "@/hooks/use-employer-notifications";
import { useEmployerProfile } from "@/hooks/use-employer-profile";
import { clearAuthSession, getAuthSession } from "@/lib/auth-session";
import {
  clearSecureShareSession,
  getSecureShareSession,
  hasLiveSharedIdSession,
} from "@/lib/secure-share-session";
import { portalAccessRedirect } from "@/lib/portal-access";
import { employerPaths } from "@/lib/portal-paths";
import { displayFullName } from "@/lib/profile-display";
import { userTypeLabel } from "@/lib/user-type";

const emptySubscribe = () => () => {};

function readScopedSessionActive() {
  const session = getSecureShareSession();
  if (!session) return false;
  if (hasLiveSharedIdSession(session)) return true;
  if (!session.token) return false;
  const share = findSecureShare(session.token);
  if (!share || isSecureShareExpired(share)) return false;
  return true;
}

function readSessionTypeLabel() {
  const sessionUser = getAuthSession()?.user;
  if (sessionUser?.type_label) return sessionUser.type_label;
  if (sessionUser?.type_id != null) return userTypeLabel(sessionUser.type_id);
  return null;
}

function handleLogout() {
  clearAuthSession();
  clearSecureShareSession();
}

function resolveUserTypeLabel(profile) {
  if (profile?.typeLabel) return profile.typeLabel;
  if (profile?.typeId != null) return userTypeLabel(profile.typeId);
  return null;
}

export function EmployerShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);
  const scopedSession = useSyncExternalStore(
    emptySubscribe,
    readScopedSessionActive,
    () => false
  );
  const sessionTypeLabel = useSyncExternalStore(
    emptySubscribe,
    readSessionTypeLabel,
    () => null
  );
  const { profile, loading: profileLoading } = useEmployerProfile();
  const {
    items: notificationItems,
    markAsRead,
    total: notificationTotal,
    unreadCount: notificationUnread,
  } = useEmployerNotifications({
    enabled: !scopedSession,
  });

  const profileUser = useMemo(() => {
    const typeLabel = resolveUserTypeLabel(profile) || sessionTypeLabel;
    if (profile) {
      return {
        ...profile,
        fullName: displayFullName(profile) || profile.fullName || "User",
        title: typeLabel || profile.jobTitle || profile.title || "",
        role: typeLabel,
      };
    }
    return {
      fullName: profileLoading ? "Loading..." : "User",
      title: profileLoading ? "" : typeLabel || "",
      role: typeLabel,
    };
  }, [profile, profileLoading, sessionTypeLabel]);

  useEffect(() => {
    const redirectTo = portalAccessRedirect("employer");
    if (redirectTo) {
      router.replace(redirectTo);
    }
  }, [router]);

  useEffect(() => {
    const session = getSecureShareSession();
    if (!session) return;

    if (hasLiveSharedIdSession(session)) {
      if (pathname && !pathname.startsWith(employerPaths.sharedDocumentsScoped)) {
        router.replace(employerPaths.sharedDocumentsScoped);
      }
      return;
    }

    if (!session.token) return;
    const share = findSecureShare(session.token);
    if (!share || isSecureShareExpired(share)) {
      clearSecureShareSession();
      return;
    }
    if (pathname && !pathname.startsWith(employerPaths.sharedDocumentsScoped)) {
      router.replace(employerPaths.sharedDocumentsScoped);
    }
  }, [pathname, router]);

  useEffect(() => {
    if (!navOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleEscape(event) {
      if (event.key === "Escape") setNavOpen(false);
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [navOpen]);

  const navItems = useMemo(
    () => (scopedSession ? employerScopedShareNavItems : employerNavItems),
    [scopedSession]
  );

  return (
    <div
      className="flex h-full w-full overflow-hidden bg-cream"
      style={{ position: "absolute", inset: 0, margin: 0, padding: 0 }}
    >
      <Sidebar
        open={navOpen}
        onClose={() => setNavOpen(false)}
        items={navItems}
        onLogout={handleLogout}
        loginHref={employerPaths.login}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar
          onMenuClick={() => setNavOpen(true)}
          portalLabel="Employer Portal"
          organizationLabel={profile?.organization}
          profileUser={profileUser}
          profileHref={
            scopedSession
              ? employerPaths.sharedDocumentsScoped
              : employerPaths.profile
          }
          settingsHref={
            scopedSession
              ? employerPaths.sharedDocumentsScoped
              : employerPaths.profilePermissions
          }
          loginHref={employerPaths.login}
          notifications={scopedSession ? [] : notificationItems}
          notificationsViewAllHref={
            scopedSession ? undefined : employerPaths.notifications
          }
          onNotificationsOpen={scopedSession ? undefined : markAsRead}
          notificationsTotalCount={scopedSession ? 0 : notificationTotal}
          notificationsUnreadCount={scopedSession ? 0 : notificationUnread}
          showSearch={false}
        />
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5 sm:py-5 md:px-6 md:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
