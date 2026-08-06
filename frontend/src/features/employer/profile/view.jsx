"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock, Shield, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonBlock, TableSkeleton } from "@/components/ui/skeleton";
import { useEmployerProfile } from "@/hooks/use-employer-profile";
import { changePassword } from "@/lib/api/auth";
import {
  fetchEmployerOrganizationUsers,
  updateEmployerProfile,
} from "@/lib/api/employer";
import { getAccessToken } from "@/lib/auth-session";
import { LOGIN_PATH } from "@/lib/auth-routes";
import { cn } from "@/lib/utils";

const profileTabs = [
  { id: "profile", label: "Profile Info", icon: UserRound },
  { id: "security", label: "Security", icon: Shield },
  { id: "permissions", label: "Permissions", icon: Lock },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_DIGITS_MIN = 10;
// Match dbo.UserProfiles / EmployerContacts column lengths.
const NAME_MAX = 50;
const TITLE_MAX = 100;
const EMAIL_MAX = 100;
const PHONE_MAX = 20;

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

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  error,
  placeholder,
  autoComplete,
  readOnly = false,
}) {
  return (
    <label className="block space-y-1.5" htmlFor={id}>
      <span className="text-[11px] font-semibold tracking-[0.08em] text-[#8B6D4F] uppercase">
        {label}
      </span>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        readOnly={readOnly}
        onChange={(event) => onChange?.(event.target.value)}
        className={cn(
          "w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm font-medium text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15",
          error ? "border-rose-300" : "border-border/80",
          readOnly && "cursor-default bg-cream/60 text-foreground-700"
        )}
      />
      {error ? (
        <p className="text-xs font-medium text-rose-700">{error}</p>
      ) : null}
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
          <div
            key={index}
            className={cn("space-y-2", index >= 4 && "md:col-span-2")}
          >
            <SkeletonBlock className="h-3 w-20" />
            <SkeletonBlock className="h-10 w-full" />
          </div>
        ))}
      </div>
    </Card>
  );
}

function splitFullName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function validateProfile(profile) {
  const errors = {};
  const firstName = (profile.firstName || "").trim();
  const lastName = (profile.lastName || "").trim();
  const title = (profile.title || "").trim();
  const email = (profile.email || "").trim();
  const phone = (profile.phone || "").trim();

  if (!firstName) errors.firstName = "First name is required.";
  else if (firstName.length > NAME_MAX) {
    errors.firstName = `First name must be at most ${NAME_MAX} characters.`;
  }

  if (lastName.length > NAME_MAX) {
    errors.lastName = `Last name must be at most ${NAME_MAX} characters.`;
  }

  if (title.length > TITLE_MAX) {
    errors.title = `Title must be at most ${TITLE_MAX} characters.`;
  }

  if (!email) errors.email = "Email is required.";
  else if (email.length > EMAIL_MAX) {
    errors.email = `Email must be at most ${EMAIL_MAX} characters.`;
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = "Enter a valid email address.";
  }

  if (phone) {
    if (phone.length > PHONE_MAX) {
      errors.phone = `Phone must be at most ${PHONE_MAX} characters.`;
    } else {
      const digits = phone.replace(/\D/g, "");
      if (digits.length < PHONE_DIGITS_MIN) {
        errors.phone = `Enter a valid phone number (at least ${PHONE_DIGITS_MIN} digits).`;
      }
    }
  }

  return errors;
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

function normalizeProfileSnapshot(profile) {
  return {
    firstName: (profile.firstName || "").trim(),
    lastName: (profile.lastName || "").trim(),
    title: (profile.title || "").trim(),
    email: (profile.email || "").trim(),
    phone: (profile.phone || "").trim(),
  };
}

function profilesEqual(a, b) {
  const left = normalizeProfileSnapshot(a);
  const right = normalizeProfileSnapshot(b);
  return (
    left.firstName === right.firstName &&
    left.lastName === right.lastName &&
    left.title === right.title &&
    left.email === right.email &&
    left.phone === right.phone
  );
}

export function EmployerProfileView() {
  const router = useRouter();
  const {
    profile: liveProfile,
    loading: profileLoading,
    error: profileLoadError,
    setCachedProfile,
  } = useEmployerProfile();

  const [tab, setTab] = useState("profile");
  const [message, setMessage] = useState("");
  const [successToast, setSuccessToast] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  const [profile, setProfile] = useState({
    firstName: "",
    lastName: "",
    title: "",
    userType: "",
    email: "",
    phone: "",
    organization: "",
    address: "",
    loginId: "",
  });
  const [profileErrors, setProfileErrors] = useState({});
  const [hydrated, setHydrated] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [savedProfile, setSavedProfile] = useState(null);

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [orgUsers, setOrgUsers] = useState([]);
  const [orgUsersLoading, setOrgUsersLoading] = useState(false);
  const [orgUsersLoaded, setOrgUsersLoaded] = useState(false);

  const profileDirty = useMemo(() => {
    if (!savedProfile) return false;
    return !profilesEqual(profile, savedProfile);
  }, [profile, savedProfile]);

  const passwordDirty = useMemo(() => {
    return Boolean(
      passwordForm.currentPassword ||
        passwordForm.newPassword ||
        passwordForm.confirmPassword
    );
  }, [passwordForm]);

  useEffect(() => {
    if (!liveProfile) return;
    let firstName = liveProfile.firstName || "";
    let lastName = liveProfile.lastName || "";
    if (!firstName && !lastName && liveProfile.fullName) {
      const split = splitFullName(liveProfile.fullName);
      firstName = split.firstName;
      lastName = split.lastName;
    }
    const next = {
      firstName,
      lastName,
      title: liveProfile.jobTitle || liveProfile.title || "",
      userType: liveProfile.typeLabel || "",
      email: liveProfile.email || "",
      phone: liveProfile.phone || "",
      organization: liveProfile.organization || "",
      address: liveProfile.address || "",
      loginId: liveProfile.loginId || "",
    };
    setProfile(next);
    setSavedProfile(normalizeProfileSnapshot(next));
    setHydrated(true);
  }, [liveProfile]);

  useEffect(() => {
    if (profileLoadError) {
      setErrorMessage(profileLoadError);
    }
  }, [profileLoadError]);

  useEffect(() => {
    if (tab !== "permissions" || orgUsersLoaded) return undefined;

    let cancelled = false;

    async function loadOrgUsers() {
      const token = getAccessToken();
      if (!token) {
        router.replace(LOGIN_PATH);
        return;
      }

      setOrgUsersLoading(true);
      try {
        const data = await fetchEmployerOrganizationUsers(token);
        if (!cancelled) {
          setOrgUsers(data.items);
          setOrgUsersLoaded(true);
          setErrorMessage("");
        }
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 401) {
          router.replace(LOGIN_PATH);
          return;
        }
        setErrorMessage(err?.message || "Unable to load organization users.");
      } finally {
        if (!cancelled) setOrgUsersLoading(false);
      }
    }

    loadOrgUsers();
    return () => {
      cancelled = true;
    };
  }, [tab, orgUsersLoaded, router]);

  function clearFeedback() {
    setMessage("");
    setSuccessToast(null);
    setErrorMessage("");
  }

  function updateProfileField(field, value) {
    clearFeedback();
    setProfile((prev) => ({ ...prev, [field]: value }));
    setProfileErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  async function handleSaveProfile() {
    if (profileSaving || !profileDirty) return;
    clearFeedback();
    const errors = validateProfile(profile);
    setProfileErrors(errors);
    if (Object.keys(errors).length > 0) {
      setErrorMessage("Please fix the highlighted fields before saving.");
      return;
    }

    const token = getAccessToken();
    if (!token) {
      router.replace(LOGIN_PATH);
      return;
    }

    setProfileSaving(true);
    try {
      const updated = await updateEmployerProfile(token, {
        firstName: profile.firstName.trim(),
        lastName: profile.lastName.trim(),
        title: profile.title.trim(),
        email: profile.email.trim(),
        phone: profile.phone.trim(),
      });
      setCachedProfile?.(updated);
      const next = {
        firstName: updated.firstName || "",
        lastName: updated.lastName || "",
        title: updated.jobTitle || updated.title || "",
        userType: updated.typeLabel || profile.userType,
        email: updated.email || "",
        phone: updated.phone || "",
        organization: updated.organization || "",
        address: updated.address || "",
        loginId: updated.loginId || "",
      };
      setProfile(next);
      setSavedProfile(normalizeProfileSnapshot(next));
      setProfileErrors({});
      setMessage("");
      setSuccessToast({
        title: "Profile saved",
        message: "Your profile details were updated successfully.",
      });
    } catch (err) {
      if (err?.status === 401) {
        router.replace(LOGIN_PATH);
        return;
      }
      const detail = err?.detail ?? err?.message;
      if (detail && typeof detail === "object" && detail.errors) {
        const mapped = {};
        for (const [key, value] of Object.entries(detail.errors)) {
          const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
          mapped[camel] = value;
        }
        setProfileErrors(mapped);
        setErrorMessage(detail.message || "Please fix the highlighted fields.");
      } else {
        setErrorMessage(
          typeof detail === "string" ? detail : "Unable to update profile."
        );
      }
    } finally {
      setProfileSaving(false);
    }
  }

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
      router.replace(LOGIN_PATH);
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
      setMessage("");
      setSuccessToast({
        title: "Password updated",
        message: "Your password was reset successfully. Use it the next time you sign in.",
      });
    } catch (err) {
      if (err?.status === 401) {
        router.replace(LOGIN_PATH);
        return;
      }
      setErrorMessage(err?.message || "Unable to update password.");
    } finally {
      setPasswordSaving(false);
    }
  }

  function switchTab(nextTab) {
    clearFeedback();
    setTab(nextTab);
  }

  const showProfileSkeleton = profileLoading && !hydrated;

  return (
    <div>
      <SuccessToast
        title={successToast?.title}
        message={successToast?.message}
        onDismiss={() => setSuccessToast(null)}
      />
      <PageHeader title="Profile / Security" className="mb-5" />
      <ProfileTabBar value={tab} onChange={switchTab} />

      <StatusBanner tone="success">{message}</StatusBanner>
      <StatusBanner tone="error">{errorMessage}</StatusBanner>

      {tab === "profile" ? (
        showProfileSkeleton ? (
          <ProfileInfoSkeleton />
        ) : (
          <Card className="p-5 sm:p-6">
            <h2 className="mb-5 text-lg font-semibold text-ink">
              Profile Info
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                id="employer-first-name"
                label="First Name"
                value={profile.firstName}
                onChange={(value) => updateProfileField("firstName", value)}
                error={profileErrors.firstName}
                autoComplete="given-name"
                placeholder="Up to 50 characters"
              />
              <Field
                id="employer-last-name"
                label="Last Name"
                value={profile.lastName}
                onChange={(value) => updateProfileField("lastName", value)}
                error={profileErrors.lastName}
                autoComplete="family-name"
                placeholder="Up to 50 characters"
              />
              <Field
                id="employer-user-type"
                label="User Type"
                value={profile.userType || "—"}
                readOnly
              />
              <Field
                id="employer-title"
                label="Title"
                value={profile.title}
                onChange={(value) => updateProfileField("title", value)}
                error={profileErrors.title}
                placeholder="Job title (optional, up to 100)"
              />
              <Field
                id="employer-login-id"
                label="Login ID"
                value={profile.loginId || "—"}
                readOnly
              />
              <Field
                id="employer-email"
                label="Email"
                type="email"
                value={profile.email}
                onChange={(value) => updateProfileField("email", value)}
                error={profileErrors.email}
                autoComplete="email"
                placeholder="Up to 100 characters"
              />
              <Field
                id="employer-phone"
                label="Phone"
                type="tel"
                value={profile.phone}
                onChange={(value) => updateProfileField("phone", value)}
                error={profileErrors.phone}
                autoComplete="tel"
                placeholder="Up to 20 characters"
              />
              <div className="md:col-span-2">
                <Field
                  id="employer-organization"
                  label="Organization"
                  value={profile.organization || "—"}
                  readOnly
                />
              </div>
              <div className="md:col-span-2">
                <Field
                  id="employer-address"
                  label="Address"
                  value={profile.address || "—"}
                  readOnly
                />
              </div>
            </div>
            <Button
              className={cn(
                "mt-6 min-w-[9.5rem]",
                profileSaving &&
                  "bg-primary/55 text-white/90 hover:bg-primary/55 shadow-none"
              )}
              onClick={handleSaveProfile}
              disabled={profileSaving || !profileDirty}
              aria-busy={profileSaving}
            >
              {profileSaving ? "Saving..." : "Save Changes"}
            </Button>
          </Card>
        )
      ) : null}

      {tab === "security" ? (
        <div className="space-y-5">
          <Card className="p-5 sm:p-6">
            <h2 className="mb-5 text-lg font-semibold text-ink">
              Change Password
            </h2>
            <div className="max-w-xl space-y-4">
              <Field
                id="current-password"
                label="Current Password"
                type="password"
                value={passwordForm.currentPassword}
                onChange={(value) => {
                  clearFeedback();
                  setPasswordForm((prev) => ({
                    ...prev,
                    currentPassword: value,
                  }));
                }}
                error={passwordErrors.currentPassword}
                placeholder="Enter current password"
                autoComplete="current-password"
              />
              <Field
                id="new-password"
                label="New Password"
                type="password"
                value={passwordForm.newPassword}
                onChange={(value) => {
                  clearFeedback();
                  setPasswordForm((prev) => ({ ...prev, newPassword: value }));
                }}
                error={passwordErrors.newPassword}
                placeholder="Enter new password"
                autoComplete="new-password"
              />
              <Field
                id="confirm-password"
                label="Confirm New Password"
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(value) => {
                  clearFeedback();
                  setPasswordForm((prev) => ({
                    ...prev,
                    confirmPassword: value,
                  }));
                }}
                error={passwordErrors.confirmPassword}
                placeholder="Confirm new password"
                autoComplete="new-password"
              />
            </div>
            <Button
              className="mt-6"
              onClick={handleUpdatePassword}
              disabled={passwordSaving || !passwordDirty}
            >
              {passwordSaving ? "Updating…" : "Update Password"}
            </Button>
          </Card>

          {/* Two-Factor Authentication — hidden for now (no 2FA in clinic DB)
          <Card className="p-5 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-ink">
              Two-Factor Authentication
            </h2>
            <p className="text-sm text-muted">
              Two-factor authentication is not available in the current clinic
              database (no 2FA tables or columns). No action is available here.
            </p>
          </Card>
          */}
        </div>
      ) : null}

      {tab === "permissions" ? (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-border/60 px-5 py-4 sm:px-6">
            <h2 className="text-lg font-semibold text-ink">
              Organization Users
            </h2>
            <p className="mt-1 text-sm text-muted">
              Users linked to this organization and their system roles.
            </p>
          </div>

          {orgUsersLoading ? (
            <div className="px-5 py-5 sm:px-6">
              <TableSkeleton rows={4} columns={3} />
            </div>
          ) : orgUsers.length === 0 ? (
            <div className="px-5 py-8 sm:px-6">
              <EmptyState
                title="No organization users found"
                description="No contacts are linked to this organization yet."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[36rem] w-full text-left text-sm">
                <thead className="border-b border-border/70 bg-cream/50 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                  <tr>
                    <th className="px-5 py-3">User</th>
                    <th className="px-5 py-3">Role</th>
                    <th className="px-5 py-3">Access Level</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {orgUsers.map((user) => (
                    <tr key={user.id} className="bg-white">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-ink">{user.fullName}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {user.email || "—"}
                        </p>
                        {user.title ? (
                          <p className="mt-0.5 text-xs text-muted">{user.title}</p>
                        ) : null}
                      </td>
                      <td className="px-5 py-4 text-ink">{user.role}</td>
                      <td className="px-5 py-4 text-ink">{user.accessLevel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="border-t border-border/60 bg-cream-deep/70 px-5 py-3.5 sm:px-6">
            <p className="text-sm font-medium text-ink">
              Users:{" "}
              <span className="font-semibold">{orgUsers.length}</span>
              {" · "}
              Employer ID:{" "}
              <span className="font-semibold">
                {liveProfile?.employerId ?? "—"}
              </span>
            </p>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
