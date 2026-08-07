"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { insuranceNavItems } from "@/data/navigation";
import {
  currentInsuranceUser,
  insuranceNotifications,
} from "@/data/insurance";
import { useInsuranceProfile } from "@/hooks/use-insurance-profile";
import {
  clearAuthSession,
  getAccessToken,
  getAuthSession,
} from "@/lib/auth-session";
import { getLoginHref, insurancePaths } from "@/lib/portal-paths";
import { userTypeLabel } from "@/lib/user-type";

function buildProfileUser(apiProfile, sessionUser) {
  const typeLabel =
    apiProfile?.typeLabel ||
    sessionUser?.type_label ||
    userTypeLabel(apiProfile?.typeId ?? sessionUser?.type_id) ||
    currentInsuranceUser.title;

  const fullName =
    apiProfile?.fullName ||
    sessionUser?.name ||
    [sessionUser?.first_name, sessionUser?.last_name].filter(Boolean).join(" ") ||
    currentInsuranceUser.fullName;

  return {
    ...currentInsuranceUser,
    fullName,
    email:
      apiProfile?.email ||
      sessionUser?.email ||
      sessionUser?.login_id ||
      currentInsuranceUser.email,
    phone: apiProfile?.phone || currentInsuranceUser.phone,
    title: typeLabel,
    role: typeLabel,
    organization: apiProfile?.organization || currentInsuranceUser.organization,
    address: apiProfile?.address || currentInsuranceUser.address,
  };
}

export function InsuranceShell({ children }) {
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [loginHref, setLoginHref] = useState(insurancePaths.login);
  const { profile, loading: profileLoading } = useInsuranceProfile();

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      router.replace(insurancePaths.login);
      return;
    }

    const session = getAuthSession();
    const sessionUser = session?.user;
    const portal = (sessionUser?.portal || "").toLowerCase();
    if (portal && portal !== "insurance") {
      clearAuthSession();
      router.replace(insurancePaths.login);
      return;
    }

    setLoginHref(
      getLoginHref({
        portal: "insurance",
        activationKey: sessionUser?.activation_key,
      })
    );
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

  const sessionUser = getAuthSession()?.user;
  const profileUser = useMemo(
    () => buildProfileUser(profile, sessionUser),
    [profile, sessionUser]
  );

  const organizationLabel =
    profile?.organization ||
    (profileLoading ? "Loading…" : currentInsuranceUser.organization);

  function handleLogout() {
    clearAuthSession();
  }

  if (!ready) {
    return (
      <div
        className="flex h-full w-full items-center justify-center bg-cream text-sm text-muted"
        style={{ position: "absolute", inset: 0, margin: 0, padding: 0 }}
      >
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
        items={insuranceNavItems}
        onLogout={handleLogout}
        loginHref={loginHref}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar
          onMenuClick={() => setNavOpen(true)}
          portalLabel="Insurance Portal"
          organizationLabel={organizationLabel}
          profileUser={profileUser}
          profileHref={insurancePaths.profile}
          notifications={insuranceNotifications}
          showSearch={false}
        />
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5 sm:py-5 md:px-6 md:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
