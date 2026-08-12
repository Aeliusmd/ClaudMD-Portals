"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, Shield, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PasswordField } from "@/components/ui/password-field";
import { SkeletonBlock } from "@/components/ui/skeleton";
import { currentPatient } from "@/data/patient";
import { usePatientProfile } from "@/hooks/use-patient-profile";
import { changePassword } from "@/lib/api/auth";
import { updatePatientProfile } from "@/lib/api/patient";
import { getAccessToken } from "@/lib/auth-session";
import { patientPaths } from "@/lib/portal-paths";
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
  { id: "notifications", label: "Notifications", icon: Bell },
];

const ADDRESS_MAX = 500;
const NAME_MAX = 50;
const FULL_NAME_MAX = 101;

function emptyProfileForm() {
  return {
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    email: "",
    phone: "",
    address: "",
  };
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

function joinFullName(firstName, lastName) {
  return [firstName, lastName]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
}

function normalizeProfileSnapshot(profile) {
  return {
    firstName: (profile.firstName || "").trim(),
    lastName: (profile.lastName || "").trim(),
    email: (profile.email || "").trim(),
    phone: (profile.phone || "").trim(),
    address: (profile.address || "").trim(),
  };
}

function profilesEqual(a, b) {
  const left = normalizeProfileSnapshot(a);
  const right = normalizeProfileSnapshot(b);
  return (
    left.firstName === right.firstName &&
    left.lastName === right.lastName &&
    left.email === right.email &&
    left.phone === right.phone &&
    left.address === right.address
  );
}

function displayFieldValue(value, editing) {
  if (editing) return value ?? "";
  return value || "—";
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
  readOnly = false,
  maxLength,
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
        readOnly={readOnly}
        maxLength={maxLength}
        onChange={
          readOnly || !onChange
            ? undefined
            : (event) => onChange(event.target.value)
        }
        className={cn(
          "w-full rounded-xl border px-3.5 py-2.5 text-sm font-medium text-ink outline-none transition placeholder:text-muted/80",
          readOnly
            ? "cursor-default border-border/80 bg-cream/60 text-foreground-700"
            : "border-border/80 bg-white focus:border-primary focus:ring-2 focus:ring-primary/15",
          error ? "border-rose-300" : null
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
  if (errors.full_name) {
    mapped.firstName = errors.full_name;
    mapped.lastName = errors.full_name;
  }
  if (errors.first_name) mapped.firstName = errors.first_name;
  if (errors.last_name) mapped.lastName = errors.last_name;
  if (errors.date_of_birth) mapped.dateOfBirth = errors.date_of_birth;
  if (errors.email) mapped.email = errors.email;
  if (errors.phone) mapped.phone = errors.phone;
  if (errors.address) mapped.address = errors.address;
  return mapped;
}

function validateProfileForm(values) {
  const errors = {};
  const firstName = (values.firstName || "").trim();
  const lastName = (values.lastName || "").trim();
  const fullName = joinFullName(firstName, lastName);

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

  if (fullName.length > FULL_NAME_MAX) {
    errors.lastName = `Full name must be at most ${FULL_NAME_MAX} characters.`;
  }

  const emailErr = emailError(values.email);
  if (emailErr) errors.email = emailErr;

  const phoneErr = phoneError(values.phone);
  if (phoneErr) errors.phone = phoneErr;

  const address = (values.address || "").trim();
  if (address.length > ADDRESS_MAX) {
    errors.address = `Address must be at most ${ADDRESS_MAX} characters.`;
  } else if (address) {
    const err = unsafeMarkupError(address);
    if (err) errors.address = err;
  }

  return errors;
}

function validatePassword(form) {
  const errors = {};
  if (!form.currentPassword) {
    errors.currentPassword = "Enter your current password.";
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
  const [isEditing, setIsEditing] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [profile, setProfile] = useState(emptyProfileForm);
  const [savedProfile, setSavedProfile] = useState(null);
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
      dateOfBirth: liveProfile.dateOfBirth || "",
      email: liveProfile.email || "",
      phone: liveProfile.phone || "",
      address: liveProfile.address || "",
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
    if (isEditing) {
      cancelEditProfile();
    }
    setTab(next);
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
        address: savedProfile.address,
      }));
    }
    setIsEditing(false);
  }

  function toggleNotification(field) {
    clearFeedback();
    setNotifications((prev) => ({ ...prev, [field]: !prev[field] }));
  }

  async function handleSaveProfile() {
    if (profileSaving || !profileDirty) return;
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
        fullName: joinFullName(profile.firstName, profile.lastName),
        // DOB stays read-only; send current value so backend does not clear it.
        dateOfBirth: profile.dateOfBirth.trim() || null,
        email: profile.email.trim(),
        phone: profile.phone.trim() || null,
        address: profile.address.trim() || null,
      });
      setCachedProfile?.(updated);
      let firstName = updated.firstName || "";
      let lastName = updated.lastName || "";
      if (!firstName && !lastName && updated.fullName) {
        const split = splitFullName(updated.fullName);
        firstName = split.firstName;
        lastName = split.lastName;
      }
      const next = {
        firstName,
        lastName,
        dateOfBirth: updated.dateOfBirth || "",
        email: updated.email || "",
        phone: updated.phone || "",
        address: updated.address || "",
      };
      setProfile(next);
      setSavedProfile(normalizeProfileSnapshot(next));
      setProfileErrors({});
      setIsEditing(false);
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
  const loginDisplay = liveProfile?.loginId || profile.email || "—";

  return (
    <div>
      <PageHeader title="Profile / Security" className="mb-5" />
      <ProfileTabBar value={tab} onChange={switchTab} />

      <StatusBanner tone="success">{message}</StatusBanner>
      <StatusBanner tone="error">{errorMessage}</StatusBanner>

      {tab === "profile" ? (
        <Card className="p-5 sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">
              Personal Information
            </h2>
            {!showProfileSkeleton ? (
              isEditing ? (
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
              )
            ) : null}
          </div>
          {showProfileSkeleton ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <SkeletonBlock className="h-16" />
              <SkeletonBlock className="h-16" />
              <SkeletonBlock className="h-16" />
              <SkeletonBlock className="h-16" />
              <SkeletonBlock className="h-16 sm:col-span-2" />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="firstName"
                label="First Name"
                value={displayFieldValue(profile.firstName, isEditing)}
                readOnly={!isEditing}
                maxLength={NAME_MAX}
                error={profileErrors.firstName}
                autoComplete="given-name"
                onChange={(value) => updateProfileField("firstName", value)}
              />
              <Field
                id="lastName"
                label="Last Name"
                value={displayFieldValue(profile.lastName, isEditing)}
                readOnly={!isEditing}
                maxLength={NAME_MAX}
                error={profileErrors.lastName}
                autoComplete="family-name"
                onChange={(value) => updateProfileField("lastName", value)}
              />
              <Field
                id="dateOfBirth"
                label="Date of Birth"
                type="date"
                value={profile.dateOfBirth || ""}
                readOnly
              />
              <Field
                id="email"
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
                id="phone"
                label="Phone"
                type="tel"
                value={displayFieldValue(profile.phone, isEditing)}
                readOnly={!isEditing}
                maxLength={PHONE_MAX}
                error={profileErrors.phone}
                autoComplete="tel"
                onChange={(value) => updateProfileField("phone", value)}
              />
              <div className="sm:col-span-2">
                <Field
                  id="address"
                  label="Address"
                  value={displayFieldValue(profile.address, isEditing)}
                  readOnly={!isEditing}
                  maxLength={ADDRESS_MAX}
                  error={profileErrors.address}
                  autoComplete="street-address"
                  onChange={(value) => updateProfileField("address", value)}
                />
              </div>
            </div>
          )}
        </Card>
      ) : null}

      {tab === "security" ? (
        <Card className="p-5 sm:p-6">
          <h2 className="mb-3 text-lg font-semibold text-ink">Security</h2>
          <p className="text-sm text-muted">
            Update your password below. Your login cannot be changed here.
          </p>
          <div className="mt-5 max-w-xl space-y-4">
            <Field
              id="security-email"
              label="Email / Login"
              value={loginDisplay}
              readOnly
            />
            <div className="border-t border-border/60 pt-5">
              <h3 className="mb-4 text-base font-semibold text-ink">
                Change Password
              </h3>
              <div className="space-y-4">
                <PasswordField
                  id="patient-current-password"
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
                  id="patient-new-password"
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
                  id="patient-confirm-password"
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
