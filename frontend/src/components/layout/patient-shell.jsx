"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { patientNavItems } from "@/data/navigation";
import { usePatientNotifications } from "@/hooks/use-patient-notifications";
import { usePatientProfile } from "@/hooks/use-patient-profile";
import {
  clearAuthSession,
  getAccessToken,
  getAuthSession,
} from "@/lib/auth-session";
import { portalAccessRedirect } from "@/lib/portal-access";
import { patientPaths } from "@/lib/portal-paths";
import { userTypeLabel } from "@/lib/user-type";

function handleLogout() {
  clearAuthSession();
}

function sessionProfileUser() {
  const session = getAuthSession();
  const user = session?.user;
  if (!user) {
    return {
      fullName: "Patient",
      title: "",
      role: null,
    };
  }

  const fullName =
    user.name ||
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    user.email ||
    user.login_id ||
    "Patient";
  const typeLabel =
    user.type_label ||
    (user.type_id != null ? userTypeLabel(user.type_id) : null);

  return {
    fullName,
    title: typeLabel || "",
    role: typeLabel,
  };
}

export function PatientShell({ children }) {
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [sessionUser, setSessionUser] = useState(() => sessionProfileUser());
  const { profile } = usePatientProfile();
  const {
    items: notificationItems,
    markAsRead,
    total: notificationTotal,
    unreadCount: notificationUnread,
  } = usePatientNotifications();

  useEffect(() => {
    const redirectTo = portalAccessRedirect("patient");
    if (redirectTo) {
      router.replace(redirectTo);
      return;
    }
    const token = getAccessToken();
    if (!token) {
      router.replace(patientPaths.login);
      return;
    }
    setSessionUser(sessionProfileUser());
    setReady(true);
  }, [router]);

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

  const profileHref = useMemo(() => patientPaths.profile, []);

  const profileUser = useMemo(() => {
    if (!profile) return sessionUser;
    return {
      fullName: profile.fullName || sessionUser.fullName,
      title: profile.typeLabel || sessionUser.title || "",
      role: profile.typeLabel || sessionUser.role,
    };
  }, [profile, sessionUser]);

  if (!ready) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-cream text-sm text-muted">
        Loading…
      </div>
    );
  }

  return (
    <div
      className="flex h-full w-full overflow-hidden bg-cream"
      style={{ position: "absolute", inset: 0, margin: 0, padding: 0 }}
    >
      <Sidebar
        open={navOpen}
        onClose={() => setNavOpen(false)}
        items={patientNavItems}
        onLogout={handleLogout}
        loginHref={patientPaths.login}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar
          onMenuClick={() => setNavOpen(true)}
          portalLabel="Patient Portal"
          profileUser={profileUser}
          profileHref={profileHref}
          loginHref={patientPaths.login}
          notifications={notificationItems}
          notificationsViewAllHref={patientPaths.notifications}
          onNotificationsOpen={markAsRead}
          notificationsTotalCount={notificationTotal}
          notificationsUnreadCount={notificationUnread}
          showSearch={false}
        />
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5 sm:py-5 md:px-6 md:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
