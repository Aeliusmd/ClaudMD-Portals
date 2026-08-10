"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, Shield, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonBlock } from "@/components/ui/skeleton";
import { currentPatient } from "@/data/patient";
import { usePatientProfile } from "@/hooks/use-patient-profile";
import { changePassword } from "@/lib/api/auth";
import { updatePatientProfile } from "@/lib/api/patient";
import { getAccessToken } from "@/lib/auth-session";
import { patientPaths } from "@/lib/portal-paths";
import {
  emailError,
  phoneError,
  sanitizePhoneInput,
} from "@/lib/contact-validation";
import { unsafeMarkupError } from "@/lib/text-validation";
import { cn } from "@/lib/utils";

const profileTabs = [
  { id: "profile", label: "Profile Info", icon: UserRound },
  { id: "security", label: "Security", icon: Shield },
  { id: "notifications", label: "Notifications", icon: Bell },
];

const ADDRESS_MAX = 500;
const NAME_MAX = 101;

function emptyProfileForm() {
  return {
    fullName: "",
    dateOfBirth: "",
    email: "",
    phone: "",
    address: "",
  };
}

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
  placeholder,
  error,
  autoComplete,
}) {
  return (
    <label className="block space-y-1.5" htmlFor={id}>
      <span className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
        {label}
      </span>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm font-medium text-ink outline-none transition placeholder:text-muted/80 focus:border-primary focus:ring-2 focus:ring-primary/15",
          error ? "border-rose-300" : "border-border/80"
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

function CheckboxPreference({ title, description, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-3">
      <span className="relative mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="peer sr-only"
        />
        <span
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded border transition",
            checked
              ? "border-primary bg-primary text-white"
              : "border-border bg-white"
          )}
        >
          {checked ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-sm text-muted">{description}</span>
      </span>
    </label>
  );
}

function fieldErrorsFromApi(detail) {
  if (!detail || typeof detail !== "object") return {};
  const errors = detail.errors || detail;
  if (!errors || typeof errors !== "object" || Array.isArray(errors)) return {};
  const mapped = {};
  if (errors.full_name) mapped.fullName = errors.full_name;
  if (errors.date_of_birth) mapped.dateOfBirth = errors.date_of_birth;
  if (errors.email) mapped.email = errors.email;
  if (errors.phone) mapped.phone = errors.phone;
  if (errors.address) mapped.address = errors.address;
  return mapped;
}

export function PatientProfileView() {
  const router = useRouter();
  const {
    profile: liveProfile,
    loading: profileLoading,
    error: profileLoadError,
    setCachedProfile,
  } = usePatientProfile();

  const [tab, setTab] = useState("profile");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [profile, setProfile] = useState(emptyProfileForm);
  const [profileErrors, setProfileErrors] = useState({});
  const [notifications, setNotifications] = useState(
    currentPatient.notifications
  );
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordErrors, setPasswordErrors] = useState({});

  useEffect(() => {
    if (!liveProfile) return;
    setProfile({
      fullName: liveProfile.fullName || "",
      dateOfBirth: liveProfile.dateOfBirth || "",
      email: liveProfile.email || "",
      phone: liveProfile.phone || "",
      address: liveProfile.address || "",
    });
    setHydrated(true);
  }, [liveProfile]);

  useEffect(() => {
    if (profileLoadError) {
      setErrorMessage(profileLoadError);
    }
  }, [profileLoadError]);

  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => {
      setMessage("");
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [message]);

  function clearFeedback() {
    setMessage("");
    setErrorMessage("");
  }

  function switchTab(next) {
    clearFeedback();
    setTab(next);
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

  function toggleNotification(field) {
    clearFeedback();
    setNotifications((prev) => ({ ...prev, [field]: !prev[field] }));
  }

  function validateProfileForm(values) {
    const errors = {};
    const fullName = values.fullName.trim();
    if (!fullName) errors.fullName = "Full name is required.";
    else if (fullName.length > NAME_MAX) {
      errors.fullName = `Full name must be at most ${NAME_MAX} characters.`;
    } else {
      const err = unsafeMarkupError(fullName);
      if (err) errors.fullName = err;
    }

    const emailErr = emailError(values.email);
    if (emailErr) errors.email = emailErr;

    const phoneErr = phoneError(values.phone);
    if (phoneErr) errors.phone = phoneErr;

    const address = values.address.trim();
    if (address.length > ADDRESS_MAX) {
      errors.address = `Address must be at most ${ADDRESS_MAX} characters.`;
    } else if (address) {
      const err = unsafeMarkupError(address);
      if (err) errors.address = err;
    }

    return errors;
  }

  async function handleSaveProfile() {
    if (profileSaving) return;
    clearFeedback();
    const errors = validateProfileForm(profile);
    setProfileErrors(errors);
    if (Object.keys(errors).length > 0) {
      setErrorMessage("Please fix the highlighted fields before saving.");
      return;
    }

    const token = getAccessToken();
    if (!token) {
      router.replace(patientPaths.login);
      return;
    }

    setProfileSaving(true);
    try {
      const updated = await updatePatientProfile(token, {
        fullName: profile.fullName.trim(),
        dateOfBirth: profile.dateOfBirth.trim() || null,
        email: profile.email.trim(),
        phone: profile.phone.trim() || null,
        address: profile.address.trim() || null,
      });
      setCachedProfile?.(updated);
      setProfile({
        fullName: updated.fullName || "",
        dateOfBirth: updated.dateOfBirth || "",
        email: updated.email || "",
        phone: updated.phone || "",
        address: updated.address || "",
      });
      setProfileErrors({});
      setMessage("Profile changes saved successfully.");
    } catch (err) {
      if (err?.status === 401) {
        router.replace(patientPaths.login);
        return;
      }
      const apiErrors = fieldErrorsFromApi(err?.detail);
      if (Object.keys(apiErrors).length > 0) {
        setProfileErrors(apiErrors);
      }
      setErrorMessage(err?.message || "Unable to save profile changes.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleUpdatePassword() {
    if (passwordSaving) return;
    clearFeedback();
    const errors = {};
    if (!passwordForm.currentPassword) {
      errors.currentPassword = "Enter your current password.";
    }
    if (passwordForm.newPassword.length < 8) {
      errors.newPassword = "New password must be at least 8 characters.";
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      errors.confirmPassword = "Passwords do not match.";
    }
    setPasswordErrors(errors);
    if (Object.keys(errors).length > 0) {
      setErrorMessage("Please fix the password fields before updating.");
      return;
    }

    const token = getAccessToken();
    if (!token) {
      router.replace(patientPaths.login);
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
      setMessage("Password updated successfully.");
    } catch (err) {
      if (err?.status === 401) {
        router.replace(patientPaths.login);
        return;
      }
      setErrorMessage(err?.message || "Unable to update password.");
    } finally {
      setPasswordSaving(false);
    }
  }

  const showProfileSkeleton = profileLoading && !hydrated;

  return (
    <div>
      <PageHeader title="Profile / Security" className="mb-5" />
      <ProfileTabBar value={tab} onChange={switchTab} />

      <StatusBanner tone="success">{message}</StatusBanner>
      <StatusBanner tone="error">{errorMessage}</StatusBanner>

      {tab === "profile" ? (
        <Card className="p-5 sm:p-6">
          <h2 className="mb-5 text-lg font-semibold text-ink">
            Personal Information
          </h2>
          {showProfileSkeleton ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <SkeletonBlock className="h-16" />
              <SkeletonBlock className="h-16" />
              <SkeletonBlock className="h-16" />
              <SkeletonBlock className="h-16" />
              <SkeletonBlock className="h-16 sm:col-span-2" />
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="fullName"
                  label="Full Name"
                  value={profile.fullName}
                  onChange={(value) => updateProfileField("fullName", value)}
                  error={profileErrors.fullName}
                  autoComplete="name"
                />
                <Field
                  id="dateOfBirth"
                  label="Date of Birth"
                  type="date"
                  value={profile.dateOfBirth}
                  onChange={(value) => updateProfileField("dateOfBirth", value)}
                  error={profileErrors.dateOfBirth}
                />
                <Field
                  id="email"
                  label="Email"
                  type="email"
                  value={profile.email}
                  onChange={(value) => updateProfileField("email", value)}
                  error={profileErrors.email}
                  autoComplete="email"
                />
                <Field
                  id="phone"
                  label="Phone"
                  type="tel"
                  value={profile.phone}
                  onChange={(value) =>
                    updateProfileField("phone", sanitizePhoneInput(value))
                  }
                  error={profileErrors.phone}
                  autoComplete="tel"
                />
                <div className="sm:col-span-2">
                  <Field
                    id="address"
                    label="Address"
                    value={profile.address}
                    onChange={(value) => updateProfileField("address", value)}
                    error={profileErrors.address}
                    autoComplete="street-address"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <Button onClick={handleSaveProfile} disabled={profileSaving}>
                  {profileSaving ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </>
          )}
        </Card>
      ) : null}

      {tab === "security" ? (
        <Card className="p-5 sm:p-6">
          <h2 className="mb-5 text-lg font-semibold text-ink">
            Change Password
          </h2>
          <div className="grid max-w-xl gap-4">
            <Field
              id="currentPassword"
              label="Current Password"
              type="password"
              placeholder="Enter current password"
              value={passwordForm.currentPassword}
              onChange={(value) => {
                clearFeedback();
                setPasswordForm((prev) => ({
                  ...prev,
                  currentPassword: value,
                }));
              }}
              error={passwordErrors.currentPassword}
              autoComplete="current-password"
            />
            <Field
              id="newPassword"
              label="New Password"
              type="password"
              placeholder="Enter new password"
              value={passwordForm.newPassword}
              onChange={(value) => {
                clearFeedback();
                setPasswordForm((prev) => ({ ...prev, newPassword: value }));
              }}
              error={passwordErrors.newPassword}
              autoComplete="new-password"
            />
            <Field
              id="confirmPassword"
              label="Confirm New Password"
              type="password"
              placeholder="Confirm new password"
              value={passwordForm.confirmPassword}
              onChange={(value) => {
                clearFeedback();
                setPasswordForm((prev) => ({
                  ...prev,
                  confirmPassword: value,
                }));
              }}
              error={passwordErrors.confirmPassword}
              autoComplete="new-password"
            />
          </div>
          <div className="mt-6 flex justify-end">
            <Button onClick={handleUpdatePassword} disabled={passwordSaving}>
              {passwordSaving ? "Updating…" : "Update Password"}
            </Button>
          </div>
        </Card>
      ) : null}

      {tab === "notifications" ? (
        <Card className="p-5 sm:p-6">
          <h2 className="mb-2 text-lg font-semibold text-ink">
            Notification Preferences
          </h2>
          <div className="divide-y divide-border/60">
            <CheckboxPreference
              title="Appointment reminders"
              description="Receive email reminders before upcoming appointments"
              checked={notifications.appointmentReminders}
              onChange={() => toggleNotification("appointmentReminders")}
            />
            <CheckboxPreference
              title="New document shared"
              description="Get notified when a new report or document is shared"
              checked={notifications.newDocumentShared}
              onChange={() => toggleNotification("newDocumentShared")}
            />
            <CheckboxPreference
              title="Visit updates"
              description="Receive updates about your visit status and results"
              checked={notifications.visitUpdates}
              onChange={() => toggleNotification("visitUpdates")}
            />
            <CheckboxPreference
              title="Marketing & newsletters"
              description="Receive health tips and platform updates"
              checked={notifications.marketing}
              onChange={() => toggleNotification("marketing")}
            />
          </div>
          <div className="mt-6 flex justify-end">
            <Button
              onClick={() => {
                clearFeedback();
                setMessage("Notification preferences saved successfully.");
              }}
            >
              Save Preferences
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
