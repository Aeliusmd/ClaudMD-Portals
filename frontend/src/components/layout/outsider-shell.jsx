"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import {
  outsiderNavItems,
  outsiderScopedShareNavItems,
} from "@/data/navigation";
import { useOutsiderProfile } from "@/hooks/use-outsider-profile";
import {
  clearAuthSession,
  getAuthSession,
  subscribeAuthSession,
} from "@/lib/auth-session";
import {
  clearSecureShareSession,
  hasLiveSharedIdSession,
} from "@/lib/secure-share-session";
import { portalAccessRedirect } from "@/lib/portal-access";
import { outsiderPaths } from "@/lib/portal-paths";
import { displayFullName } from "@/lib/profile-display";
import { userTypeLabel } from "@/lib/user-type";

function readSessionFullName() {
  const user = getAuthSession()?.user;
  if (!user) return "";
  return (
    displayFullName({
      firstName: user.first_name,
      lastName: user.last_name,
      fullName: user.name,
    }) ||
    user.name ||
    ""
  );
}

function readSessionTypeLabel() {
  const user = getAuthSession()?.user;
  if (user?.type_label) return user.type_label;
  if (user?.type_id != null) return userTypeLabel(user.type_id);
  return null;
}

function handleLogout() {
  clearAuthSession();
  clearSecureShareSession();
}

export function OutsiderShell({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [scopedSession, setScopedSession] = useState(false);
  const sessionName = useSyncExternalStore(
    subscribeAuthSession,
    readSessionFullName,
    () => ""
  );
  const sessionTypeLabel = useSyncExternalStore(
    subscribeAuthSession,
    readSessionTypeLabel,
    () => null
  );
  const { profile, loading: profileLoading } = useOutsiderProfile();

  const profileUser = useMemo(() => {
    const typeLabel =
      profile?.typeLabel ||
      (profile?.typeId != null ? userTypeLabel(profile.typeId) : null) ||
      sessionTypeLabel ||
      "External User";

    if (profile) {
      return {
        ...profile,
        fullName: displayFullName(profile) || profile.fullName || "User",
        title: typeLabel || profile.title || "",
        role: typeLabel,
      };
    }

    return {
      fullName: sessionName || (profileLoading ? "Loading..." : "User"),
      title: typeLabel,
      role: typeLabel,
    };
  }, [profile, profileLoading, sessionName, sessionTypeLabel]);

  useEffect(() => {
    const redirectTo = portalAccessRedirect("outsider");
    if (redirectTo) {
      router.replace(redirectTo);
      return;
    }
    setScopedSession(hasLiveSharedIdSession());
  }, [router]);

  useEffect(() => {
    if (!scopedSession) return;
    if (pathname && !pathname.startsWith(outsiderPaths.sharedDocumentsScoped)) {
      router.replace(outsiderPaths.sharedDocumentsScoped);
    }
  }, [pathname, router, scopedSession]);

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

  return (
    <div
      className="flex h-full w-full overflow-hidden bg-cream"
      style={{ position: "absolute", inset: 0, margin: 0, padding: 0 }}
    >
      <Sidebar
        open={navOpen}
        onClose={() => setNavOpen(false)}
        items={scopedSession ? outsiderScopedShareNavItems : outsiderNavItems}
        onLogout={handleLogout}
        loginHref={outsiderPaths.login}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar
          onMenuClick={() => setNavOpen(true)}
          portalLabel="Share Portal"
          profileUser={profileUser}
          profileHref={
            scopedSession
              ? outsiderPaths.sharedDocumentsScoped
              : outsiderPaths.sharedDocuments
          }
          settingsHref={
            scopedSession
              ? outsiderPaths.sharedDocumentsScoped
              : outsiderPaths.sharedDocuments
          }
          loginHref={outsiderPaths.login}
          notifications={[]}
          showNotifications={false}
          showSearch={false}
          showAccountLinks={false}
        />
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5 sm:py-5 md:px-6 md:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
