"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, Shield, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PasswordField } from "@/components/ui/password-field";
import { SkeletonBlock } from "@/components/ui/skeleton";
import { useOutsiderProfile } from "@/hooks/use-outsider-profile";
import { changePassword } from "@/lib/api/auth";
import { getAccessToken } from "@/lib/auth-session";
import { outsiderPaths } from "@/lib/portal-paths";
import { cn } from "@/lib/utils";

const profileTabs = [
  { id: "profile", label: "Profile Info", icon: UserRound },
  { id: "security", label: "Security", icon: Shield },
];

const VALID_PROFILE_TABS = new Set(profileTabs.map((tab) => tab.id));

function ProfileTabBar({ value, onChange }) {
  return (
    <div className="mb-5 flex flex-wrap gap-2">
      {profileTabs.map((item) => {
        const Icon = item.icon;
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors",
              active
                ? "bg-primary text-white shadow-sm"
                : "bg-cream-deep text-ink hover:bg-border"
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function Field({ id, label, value, type = "text" }) {
  return (
    <label className="block space-y-1.5" htmlFor={id}>
      <span className="text-[11px] font-semibold tracking-[0.08em] text-[#8B6D4F] uppercase">
        {label}
      </span>
      <input
        id={id}
        type={type}
        value={value || "—"}
        readOnly
        className="w-full cursor-default rounded-xl border border-border/80 bg-cream/60 px-3.5 py-2.5 text-sm font-medium text-foreground-700 outline-none"
      />
    </label>
  );
}

function StatusBanner({ tone = "success", children }) {
  if (!children) return null;
  return (
    <div
      role="status"
      className={cn(
        "mb-4 rounded-xl border px-4 py-3 text-sm font-medium",
        tone === "error"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      )}
    >
      {children}
    </div>
  );
}

function SuccessToast({ message, title, onDismiss }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => {
      onDismiss?.();
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-20 right-4 z-[60] w-[min(22rem,calc(100vw-2rem))] sm:right-6"
    >
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3.5 shadow-[0_12px_32px_rgba(28,36,48,0.14)]">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          <Check className="h-4 w-4" strokeWidth={2.5} />
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="font-sans text-sm font-semibold text-emerald-900">
            {title || "Success"}
          </p>
          <p className="mt-0.5 font-sans text-[0.8rem] leading-snug text-emerald-800/80">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}

function ProfileInfoSkeleton() {
  return (
    <Card className="p-5 sm:p-6" aria-busy="true" aria-label="Loading profile">
      <SkeletonBlock className="mb-5 h-6 w-48" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="space-y-2">
            <SkeletonBlock className="h-3 w-20" />
            <SkeletonBlock className="h-10 w-full" />
          </div>
        ))}
      </div>
    </Card>
  );
}

function validatePassword(form) {
  const errors = {};
  if (!form.currentPassword) {
    errors.currentPassword = "Enter your current password.";
  }
  if ((form.newPassword || "").length < 4) {
    errors.newPassword = "New password must be at least 4 characters.";
  }
  if (form.newPassword !== form.confirmPassword) {
    errors.confirmPassword = "Passwords do not match.";
  }
  if (
    form.currentPassword &&
    form.newPassword &&
    form.currentPassword === form.newPassword
  ) {
    errors.newPassword = "New password must be different from the current one.";
  }
  return errors;
}

function OutsiderProfileViewInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const { profile: liveProfile, loading: profileLoading } = useOutsiderProfile();

  const [tab, setTab] = useState(
    tabFromUrl && VALID_PROFILE_TABS.has(tabFromUrl) ? tabFromUrl : "profile"
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [successToast, setSuccessToast] = useState(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordErrors, setPasswordErrors] = useState({});

  const passwordDirty = useMemo(
    () =>
      Boolean(
        passwordForm.currentPassword ||
          passwordForm.newPassword ||
          passwordForm.confirmPassword
      ),
    [passwordForm]
  );

  function clearFeedback() {
    setErrorMessage("");
    setSuccessToast(null);
  }

  function switchTab(nextTab) {
    clearFeedback();
    setTab(nextTab);
    const params = new URLSearchParams(searchParams.toString());
    if (nextTab === "profile") {
      params.delete("tab");
    } else {
      params.set("tab", nextTab);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  useEffect(() => {
    const nextTab =
      tabFromUrl && VALID_PROFILE_TABS.has(tabFromUrl) ? tabFromUrl : "profile";
    setTab((current) => (current === nextTab ? current : nextTab));
  }, [tabFromUrl]);

  async function handleUpdatePassword() {
    if (passwordSaving || !passwordDirty) return;
    clearFeedback();
    const errors = validatePassword(passwordForm);
    setPasswordErrors(errors);
    if (Object.keys(errors).length > 0) {
      setErrorMessage("Please fix the password fields before updating.");
      return;
    }

    const token = getAccessToken();
    if (!token) {
      router.replace(outsiderPaths.login);
      return;
    }

    setPasswordSaving(true);
    try {
      await changePassword({
        accessToken: token,
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
        confirmPassword: passwordForm.confirmPassword,
      });
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setPasswordErrors({});
      setSuccessToast({
        title: "Password updated",
        message:
          "Your password was reset successfully. Use it the next time you sign in.",
      });
    } catch (err) {
      if (err?.status === 401) {
        router.replace(outsiderPaths.login);
        return;
      }
      if (err?.status === 400) {
        setPasswordErrors((prev) => ({
          ...prev,
          currentPassword:
            err?.message && /current password/i.test(err.message)
              ? err.message
              : prev.currentPassword,
        }));
      }
      setErrorMessage(err?.message || "Unable to update password.");
    } finally {
      setPasswordSaving(false);
    }
  }

  const showProfileSkeleton = profileLoading && !liveProfile;

  return (
    <div>
      <SuccessToast
        title={successToast?.title}
        message={successToast?.message}
        onDismiss={() => setSuccessToast(null)}
      />
      <PageHeader title="Profile / Security" className="mb-5" />
      <ProfileTabBar value={tab} onChange={switchTab} />

      <StatusBanner tone="error">{errorMessage}</StatusBanner>

      {tab === "profile" ? (
        showProfileSkeleton ? (
          <ProfileInfoSkeleton />
        ) : (
          <Card className="p-5 sm:p-6">
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-ink">Profile Info</h2>
              <p className="mt-1 text-sm text-muted">
                Contact details are read-only. Use Security to change your password.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                id="outsider-first-name"
                label="First Name"
                value={liveProfile?.firstName}
              />
              <Field
                id="outsider-last-name"
                label="Last Name"
                value={liveProfile?.lastName}
              />
              <Field
                id="outsider-user-type"
                label="User Type"
                value={liveProfile?.typeLabel}
              />
              <Field
                id="outsider-title"
                label="Title"
                value={liveProfile?.title}
              />
              <Field
                id="outsider-login-id"
                label="Login ID"
                value={liveProfile?.loginId}
              />
              <Field
                id="outsider-email"
                label="Email"
                type="email"
                value={liveProfile?.email}
              />
              <Field
                id="outsider-phone"
                label="Phone"
                type="tel"
                value={liveProfile?.phone}
              />
            </div>
          </Card>
        )
      ) : null}

      {tab === "security" ? (
        <Card className="p-5 sm:p-6">
          <h2 className="mb-3 text-lg font-semibold text-ink">Security</h2>
          <p className="text-sm text-muted">
            Update your password below. Your login ID cannot be changed here.
          </p>
          <div className="mt-5 max-w-xl space-y-4">
            <Field
              id="outsider-security-login-id"
              label="Login ID"
              value={liveProfile?.loginId}
            />
            <div className="border-t border-border/60 pt-5">
              <h3 className="mb-4 text-base font-semibold text-ink">
                Change Password
              </h3>
              <div className="space-y-4">
                <PasswordField
                  id="outsider-current-password"
                  label="Current Password"
                  value={passwordForm.currentPassword}
                  autoComplete="off"
                  error={passwordErrors.currentPassword}
                  onChange={(value) => {
                    clearFeedback();
                    setPasswordForm((prev) => ({
                      ...prev,
                      currentPassword: value,
                    }));
                    setPasswordErrors((prev) => {
                      if (!prev.currentPassword) return prev;
                      const next = { ...prev };
                      delete next.currentPassword;
                      return next;
                    });
                  }}
                />
                <PasswordField
                  id="outsider-new-password"
                  label="New Password"
                  value={passwordForm.newPassword}
                  autoComplete="new-password"
                  error={passwordErrors.newPassword}
                  onChange={(value) => {
                    clearFeedback();
                    setPasswordForm((prev) => ({
                      ...prev,
                      newPassword: value,
                    }));
                    setPasswordErrors((prev) => {
                      if (!prev.newPassword) return prev;
                      const next = { ...prev };
                      delete next.newPassword;
                      return next;
                    });
                  }}
                />
                <PasswordField
                  id="outsider-confirm-password"
                  label="Confirm New Password"
                  value={passwordForm.confirmPassword}
                  autoComplete="new-password"
                  error={passwordErrors.confirmPassword}
                  onChange={(value) => {
                    clearFeedback();
                    setPasswordForm((prev) => ({
                      ...prev,
                      confirmPassword: value,
                    }));
                    setPasswordErrors((prev) => {
                      if (!prev.confirmPassword) return prev;
                      const next = { ...prev };
                      delete next.confirmPassword;
                      return next;
                    });
                  }}
                />
                <div className="flex justify-end pt-1">
                  <Button
                    type="button"
                    onClick={handleUpdatePassword}
                    disabled={passwordSaving || !passwordDirty}
                  >
                    {passwordSaving ? "Updating…" : "Update Password"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

export function OutsiderProfileView() {
  return (
    <Suspense
      fallback={
        <div>
          <PageHeader title="Profile / Security" className="mb-5" />
          <ProfileInfoSkeleton />
        </div>
      }
    >
      <OutsiderProfileViewInner />
    </Suspense>
  );
}
