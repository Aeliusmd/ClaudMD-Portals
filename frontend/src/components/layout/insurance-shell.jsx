"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import {
  insuranceNavItems,
  insuranceScopedShareNavItems,
} from "@/data/navigation";
import { useInsuranceNotifications } from "@/hooks/use-insurance-notifications";
import { useInsuranceProfile } from "@/hooks/use-insurance-profile";
import { clearAuthSession } from "@/lib/auth-session";
import { portalAccessRedirect } from "@/lib/portal-access";
import { insurancePaths } from "@/lib/portal-paths";
import {
  clearSecureShareSession,
  getSecureShareSession,
  hasLiveSharedIdSession,
} from "@/lib/secure-share-session";
import { displayFullName } from "@/lib/profile-display";
import { userTypeLabel } from "@/lib/user-type";

const emptySubscribe = () => () => {};

function readScopedSessionActive() {
  return hasLiveSharedIdSession(getSecureShareSession());
}

function handleLogout() {
  clearAuthSession();
  clearSecureShareSession();
}

export function InsuranceShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);
  const scopedSession = useSyncExternalStore(
    emptySubscribe,
    readScopedSessionActive,
    () => false
  );
  const { profile, loading: profileLoading } = useInsuranceProfile();
  const {
    items: notificationItems,
    markAsRead,
    total: notificationTotal,
    unreadCount: notificationUnread,
  } = useInsuranceNotifications({
    enabled: !scopedSession,
  });

  useEffect(() => {
    const redirectTo = portalAccessRedirect("insurance");
    if (redirectTo) {
      router.replace(redirectTo);
    }
  }, [router]);

  useEffect(() => {
    const session = getSecureShareSession();
    if (!hasLiveSharedIdSession(session)) return;
    if (pathname && !pathname.startsWith(insurancePaths.sharedDocumentsScoped)) {
      router.replace(insurancePaths.sharedDocumentsScoped);
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

  const profileUser = useMemo(() => {
    if (profile) {
      const typeLabel =
        profile.typeLabel ||
        (profile.typeId != null ? userTypeLabel(profile.typeId) : null);
      return {
        ...profile,
        fullName: displayFullName(profile) || profile.fullName || "User",
        title: typeLabel || profile.jobTitle || profile.title || "",
        role: typeLabel,
      };
    }
    return {
      fullName: profileLoading ? "Loading..." : "User",
      title: "",
      role: null,
    };
  }, [profile, profileLoading]);

  const navItems = useMemo(
    () => (scopedSession ? insuranceScopedShareNavItems : insuranceNavItems),
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
        loginHref={insurancePaths.login}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar
          onMenuClick={() => setNavOpen(true)}
          portalLabel="Insurance Portal"
          organizationLabel={profile?.organization}
          profileUser={profileUser}
          profileHref={
            scopedSession
              ? insurancePaths.sharedDocumentsScoped
              : insurancePaths.profile
          }
          settingsHref={
            scopedSession
              ? insurancePaths.sharedDocumentsScoped
              : insurancePaths.profilePermissions
          }
          loginHref={insurancePaths.login}
          notifications={scopedSession ? [] : notificationItems}
          notificationsViewAllHref={
            scopedSession ? undefined : insurancePaths.notifications
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
