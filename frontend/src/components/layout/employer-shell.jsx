"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { employerNotifications } from "@/data/employer";
import {
  employerNavItems,
  employerScopedShareNavItems,
} from "@/data/navigation";
import {
  findSecureShare,
  isSecureShareExpired,
} from "@/data/secure-shares";
import { useEmployerProfile } from "@/hooks/use-employer-profile";
import { clearAuthSession } from "@/lib/auth-session";
import {
  clearSecureShareSession,
  getSecureShareSession,
} from "@/lib/secure-share-session";
import { employerPaths } from "@/lib/portal-paths";

function hasActiveSecureShareSession() {
  const session = getSecureShareSession();
  if (!session?.token) return false;
  const share = findSecureShare(session.token);
  if (!share || isSecureShareExpired(share)) {
    clearSecureShareSession();
    return false;
  }
  return true;
}

function handleLogout() {
  clearAuthSession();
  clearSecureShareSession();
}

export function EmployerShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);
  const [scopedSession, setScopedSession] = useState(false);
  const { profile, loading: profileLoading } = useEmployerProfile();

  const profileUser = useMemo(
    () =>
      profile || {
        fullName: profileLoading ? "Loading..." : "Employer User",
        title: profileLoading ? "" : "Employer Contact",
        role: "Employer",
      },
    [profile, profileLoading]
  );

  useEffect(() => {
    const active = hasActiveSecureShareSession();
    setScopedSession(active);

    // Keep secure-link sessions in the scoped Shared Documents view only.
    if (
      active &&
      pathname &&
      !pathname.startsWith(employerPaths.sharedDocumentsScoped)
    ) {
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
          notifications={scopedSession ? [] : employerNotifications}
          showSearch={false}
        />
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5 sm:py-5 md:px-6 md:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
