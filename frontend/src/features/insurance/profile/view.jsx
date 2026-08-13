"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, Lock, Shield, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { PasswordField } from "@/components/ui/password-field";
import { SkeletonBlock, TableSkeleton } from "@/components/ui/skeleton";
import { useInsuranceProfile } from "@/hooks/use-insurance-profile";
import { changePassword } from "@/lib/api/auth";
import {
  fetchInsuranceOrganizationUsers,
  updateInsuranceProfile,
} from "@/lib/api/insurance";
import { getAccessToken } from "@/lib/auth-session";
import { insurancePaths } from "@/lib/portal-paths";
import {
  EMAIL_MAX,
  PHONE_MAX,
  emailError,
  phoneError,
  sanitizePhoneInput,
} from "@/lib/contact-validation";
import { unsafeMarkupError } from "@/lib/text-validation";
import { cn } from "@/lib/utils";

const profileTabs = [
  { id: "profile", label: "Profile Info", icon: UserRound },
  { id: "security", label: "Security", icon: Shield },
  { id: "permissions", label: "Permissions", icon: Lock },
];

const VALID_PROFILE_TABS = new Set(profileTabs.map((tab) => tab.id));

const NAME_MAX = 50;

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
  maxLength,
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
        maxLength={maxLength}
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
  const email = (profile.email || "").trim();
  const phone = (profile.phone || "").trim();

  if (!firstName) errors.firstName = "First name is required.";
  else if (firstName.length > NAME_MAX) {
    errors.firstName = `First name must be at most ${NAME_MAX} characters.`;
  } else {
    const err = unsafeMarkupError(firstName);
    if (err) errors.firstName = err;
  }

  if (lastName.length > NAME_MAX) {
    errors.lastName = `Last name must be at most ${NAME_MAX} characters.`;
  } else if (lastName) {
    const err = unsafeMarkupError(lastName);
    if (err) errors.lastName = err;
  }

  if (!email) errors.email = "Email is required.";
  else {
    const err = emailError(email);
    if (err) errors.email = err;
  }

  if (phone) {
    const err = phoneError(phone);
    if (err) errors.phone = err;
  }

  return errors;
}

function validatePassword(form) {
  const errors = {};
  if (!form.currentPassword) {
    errors.currentPassword = "Current password is required.";
  }
  if (!form.newPassword) {
    errors.newPassword = "New password is required.";
  } else if (form.newPassword.length < 4) {
    errors.newPassword = "New password must be at least 4 characters.";
  }
  if (!form.confirmPassword) {
    errors.confirmPassword = "Confirm your new password.";
  } else if (form.newPassword !== form.confirmPassword) {
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
    left.email === right.email &&
    left.phone === right.phone
  );
}

function displayFieldValue(value, editing) {
  if (editing) return value ?? "";
  return value || "—";
}

export function InsuranceProfileView() {
  return (
    <Suspense
      fallback={
        <div>
          <PageHeader title="Profile / Security" className="mb-5" />
          <div className="space-y-4">
            <SkeletonBlock className="h-10 w-full max-w-md" />
            <SkeletonBlock className="h-64 w-full" />
          </div>
        </div>
      }
    >
      <InsuranceProfileContent />
    </Suspense>
  );
}

function InsuranceProfileContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    profile: liveProfile,
    loading: profileLoading,
    error: profileLoadError,
    setCachedProfile,
  } = useInsuranceProfile();

  const tabFromUrl = searchParams.get("tab");
  const initialTab =
    tabFromUrl && VALID_PROFILE_TABS.has(tabFromUrl) ? tabFromUrl : "profile";
  const [tab, setTab] = useState(initialTab);
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
  const [isEditing, setIsEditing] = useState(false);
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
    if (isEditing) return;
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
  }, [liveProfile, isEditing]);

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
        router.replace(insurancePaths.login);
        return;
      }

      setOrgUsersLoading(true);
      try {
        const data = await fetchInsuranceOrganizationUsers(token);
        if (!cancelled) {
          setOrgUsers(data.items);
          setOrgUsersLoaded(true);
          setErrorMessage("");
        }
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 401) {
          router.replace(insurancePaths.login);
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
    const nextValue =
      field === "phone" ? sanitizePhoneInput(value) : value;
    setProfile((prev) => ({ ...prev, [field]: nextValue }));
    setProfileErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function startEditProfile() {
    clearFeedback();
    setProfileErrors({});
    setIsEditing(true);
  }

  function cancelEditProfile() {
    clearFeedback();
    setProfileErrors({});
    if (savedProfile) {
      setProfile((prev) => ({
        ...prev,
        firstName: savedProfile.firstName,
        lastName: savedProfile.lastName,
        email: savedProfile.email,
        phone: savedProfile.phone,
      }));
    }
    setIsEditing(false);
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
      router.replace(insurancePaths.login);
      return;
    }

    setProfileSaving(true);
    try {
      const updated = await updateInsuranceProfile(token, {
        firstName: profile.firstName.trim(),
        lastName: profile.lastName.trim(),
        title: (profile.title || "").trim(),
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
      setIsEditing(false);
      setMessage("");
      setSuccessToast({
        title: "Profile saved",
        message: "Your profile details were updated successfully.",
      });
    } catch (err) {
      if (err?.status === 401) {
        router.replace(insurancePaths.login);
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
      router.replace(insurancePaths.login);
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
        message:
          "Your password was reset successfully. Use it the next time you sign in.",
      });
    } catch (err) {
      if (err?.status === 401) {
        router.replace(insurancePaths.login);
        return;
      }
      if (err?.status === 400 && err?.message && /current password/i.test(err.message)) {
        setPasswordErrors((prev) => ({
          ...prev,
          currentPassword: err.message,
        }));
      }
      setErrorMessage(err?.message || "Unable to update password.");
    } finally {
      setPasswordSaving(false);
    }
  }

  function switchTab(nextTab) {
    clearFeedback();
    if (isEditing) {
      cancelEditProfile();
    }
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
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-ink">Profile Info</h2>
              {isEditing ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={cancelEditProfile}
                    disabled={profileSaving}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSaveProfile}
                    disabled={profileSaving || !profileDirty}
                  >
                    {profileSaving ? "Saving…" : "Save"}
                  </Button>
                </div>
              ) : (
                <Button type="button" onClick={startEditProfile}>
                  Edit
                </Button>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                id="insurance-first-name"
                label="First Name"
                value={displayFieldValue(profile.firstName, isEditing)}
                readOnly={!isEditing}
                maxLength={NAME_MAX}
                error={profileErrors.firstName}
                autoComplete="given-name"
                onChange={(value) => updateProfileField("firstName", value)}
              />
              <Field
                id="insurance-last-name"
                label="Last Name"
                value={displayFieldValue(profile.lastName, isEditing)}
                readOnly={!isEditing}
                maxLength={NAME_MAX}
                error={profileErrors.lastName}
                autoComplete="family-name"
                onChange={(value) => updateProfileField("lastName", value)}
              />
              <Field
                id="insurance-user-type"
                label="User Type"
                value={profile.userType || "—"}
                readOnly
              />
              <Field
                id="insurance-title"
                label="Title"
                value={profile.title || "—"}
                readOnly
              />
              <Field
                id="insurance-login-id"
                label="Login ID"
                value={profile.loginId || "—"}
                readOnly
              />
              <Field
                id="insurance-email"
                label="Email"
                type="email"
                value={displayFieldValue(profile.email, isEditing)}
                readOnly={!isEditing}
                maxLength={EMAIL_MAX}
                error={profileErrors.email}
                autoComplete="email"
                onChange={(value) => updateProfileField("email", value)}
              />
              <Field
                id="insurance-phone"
                label="Phone"
                type="tel"
                value={displayFieldValue(profile.phone, isEditing)}
                readOnly={!isEditing}
                maxLength={PHONE_MAX}
                error={profileErrors.phone}
                autoComplete="tel"
                onChange={(value) => updateProfileField("phone", value)}
              />
              <div className="md:col-span-2">
                <Field
                  id="insurance-organization"
                  label="Organization"
                  value={profile.organization || "—"}
                  readOnly
                />
              </div>
              <div className="md:col-span-2">
                <Field
                  id="insurance-address"
                  label="Address"
                  value={profile.address || "—"}
                  readOnly
                />
              </div>
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
              id="insurance-security-login-id"
              label="Login ID"
              value={profile.loginId || "—"}
              readOnly
            />
            <div className="border-t border-border/60 pt-5">
              <h3 className="mb-4 text-base font-semibold text-ink">
                Change Password
              </h3>
              <div className="space-y-4">
                <PasswordField
                  id="insurance-current-password"
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
                  id="insurance-new-password"
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
                  id="insurance-confirm-password"
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

      {tab === "permissions" ? (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-border/60 px-5 py-4 sm:px-6">
            <h2 className="text-lg font-semibold text-ink">
              Organization Users
            </h2>
            <p className="mt-1 text-sm text-muted">
              Users linked to this insurance organization and their access.
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
                description="No contacts are linked to this insurance organization yet."
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
        </Card>
      ) : null}
    </div>
  );
}
