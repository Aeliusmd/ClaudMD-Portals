"use client";

import { useMemo, useState } from "react";
import { Check, Lock, Shield, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ToggleRow } from "@/components/ui/toggle-row";
import {
  currentEmployer,
  employerAccessLevels,
  employerOrgUsers,
  employerPermissionAuditSeed,
} from "@/data/employer";
import { cn } from "@/lib/utils";

const profileTabs = [
  { id: "profile", label: "Profile Info", icon: UserRound },
  { id: "security", label: "Security", icon: Shield },
  { id: "permissions", label: "Permissions", icon: Lock },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_DIGITS_MIN = 10;

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
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm font-medium text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15",
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

function formatNow() {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

function validateProfile(profile) {
  const errors = {};
  if (!profile.fullName.trim()) errors.fullName = "Full name is required.";
  if (!profile.title.trim()) errors.title = "Title is required.";
  if (!EMAIL_PATTERN.test(profile.email.trim())) {
    errors.email = "Enter a valid email address.";
  }
  const digits = profile.phone.replace(/\D/g, "");
  if (digits.length < PHONE_DIGITS_MIN) {
    errors.phone = "Enter a valid phone number (at least 10 digits).";
  }
  if (!profile.organization.trim()) {
    errors.organization = "Organization is required.";
  }
  if (!profile.address.trim()) errors.address = "Address is required.";
  return errors;
}

function validatePassword(form) {
  const errors = {};
  if (!form.currentPassword) {
    errors.currentPassword = "Enter your current password.";
  }
  if (form.newPassword.length < 8) {
    errors.newPassword = "New password must be at least 8 characters.";
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

export function EmployerProfileView() {
  const [tab, setTab] = useState("profile");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [profile, setProfile] = useState({
    fullName: currentEmployer.fullName,
    title: currentEmployer.title,
    email: currentEmployer.email,
    phone: currentEmployer.phone,
    organization: currentEmployer.organization,
    address: currentEmployer.address,
  });
  const [profileErrors, setProfileErrors] = useState({});

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  const [orgUsers, setOrgUsers] = useState(employerOrgUsers);
  const [auditLog, setAuditLog] = useState(employerPermissionAuditSeed);

  const activeUsers = useMemo(
    () => orgUsers.filter((user) => user.active),
    [orgUsers]
  );
  const revokedUsers = useMemo(
    () => orgUsers.filter((user) => !user.active),
    [orgUsers]
  );

  function clearFeedback() {
    setMessage("");
    setErrorMessage("");
  }

  function pushAudit(action, detail) {
    setAuditLog((prev) => [
      {
        id: `pal-${Date.now()}`,
        at: formatNow(),
        actor: profile.fullName || currentEmployer.fullName,
        action,
        detail,
      },
      ...prev,
    ]);
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

  function handleSaveProfile() {
    clearFeedback();
    const errors = validateProfile(profile);
    setProfileErrors(errors);
    if (Object.keys(errors).length > 0) {
      setErrorMessage("Please fix the highlighted fields before saving.");
      return;
    }
    setMessage("Organization profile updated successfully.");
  }

  function handleUpdatePassword() {
    clearFeedback();
    const errors = validatePassword(passwordForm);
    setPasswordErrors(errors);
    if (Object.keys(errors).length > 0) {
      setErrorMessage("Please fix the password fields before updating.");
      return;
    }
    setPasswordForm({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
    setPasswordErrors({});
    setMessage("Password updated successfully.");
  }

  function handleToggleTwoFactor() {
    clearFeedback();
    setTwoFactorEnabled((prev) => {
      const next = !prev;
      setMessage(
        next
          ? "Two-factor authentication enabled."
          : "Two-factor authentication disabled."
      );
      return next;
    });
  }

  function handleAccessChange(userId, accessLevel) {
    clearFeedback();
    setOrgUsers((prev) =>
      prev.map((user) => {
        if (user.id !== userId) return user;
        const nextActive = accessLevel !== "No Access";
        return {
          ...user,
          accessLevel,
          role: accessLevel === "No Access" ? user.role : accessLevel,
          active: nextActive,
        };
      })
    );
    const user = orgUsers.find((item) => item.id === userId);
    pushAudit(
      accessLevel === "No Access" ? "Revoked access" : "Updated access level",
      `${user?.fullName || "User"} → ${accessLevel}`
    );
    setMessage(
      accessLevel === "No Access"
        ? `Access revoked for ${user?.fullName || "user"}.`
        : `Access updated for ${user?.fullName || "user"}.`
    );
  }

  function handleRestoreAccess(userId) {
    handleAccessChange(userId, "HR Viewer");
  }

  function switchTab(nextTab) {
    clearFeedback();
    setTab(nextTab);
  }

  return (
    <div>
      <PageHeader title="Profile / Security" className="mb-5" />
      <ProfileTabBar value={tab} onChange={switchTab} />

      <StatusBanner tone="success">{message}</StatusBanner>
      <StatusBanner tone="error">{errorMessage}</StatusBanner>

      {tab === "profile" ? (
        <Card className="p-5 sm:p-6">
          <h2 className="mb-5 text-lg font-semibold text-ink">
            Organization Profile
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              id="employer-full-name"
              label="Full Name"
              value={profile.fullName}
              onChange={(value) => updateProfileField("fullName", value)}
              error={profileErrors.fullName}
              autoComplete="name"
            />
            <Field
              id="employer-title"
              label="Title"
              value={profile.title}
              onChange={(value) => updateProfileField("title", value)}
              error={profileErrors.title}
            />
            <Field
              id="employer-email"
              label="Email"
              type="email"
              value={profile.email}
              onChange={(value) => updateProfileField("email", value)}
              error={profileErrors.email}
              autoComplete="email"
            />
            <Field
              id="employer-phone"
              label="Phone"
              type="tel"
              value={profile.phone}
              onChange={(value) => updateProfileField("phone", value)}
              error={profileErrors.phone}
              autoComplete="tel"
            />
            <div className="md:col-span-2">
              <Field
                id="employer-organization"
                label="Organization"
                value={profile.organization}
                onChange={(value) => updateProfileField("organization", value)}
                error={profileErrors.organization}
              />
            </div>
            <div className="md:col-span-2">
              <Field
                id="employer-address"
                label="Address"
                value={profile.address}
                onChange={(value) => updateProfileField("address", value)}
                error={profileErrors.address}
                autoComplete="street-address"
              />
            </div>
          </div>
          <Button className="mt-6" onClick={handleSaveProfile}>
            Save Changes
          </Button>
        </Card>
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
            <Button className="mt-6" onClick={handleUpdatePassword}>
              Update Password
            </Button>
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-ink">
              Two-Factor Authentication
            </h2>
            <ToggleRow
              title="Authenticator app / SMS codes"
              description="Require a second factor when signing in to the Employer Portal."
              checked={twoFactorEnabled}
              onChange={handleToggleTwoFactor}
            />
          </Card>
        </div>
      ) : null}

      {tab === "permissions" ? (
        <div className="space-y-5">
          <Card className="overflow-hidden p-0">
            <div className="border-b border-border/60 px-5 py-4 sm:px-6">
              <h2 className="text-lg font-semibold text-ink">
                Organization Users & Access
              </h2>
              <p className="mt-1 text-sm text-muted">
                Grant, change, or revoke portal access for your team. Changes are
                demo-only until backend wiring.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[48rem] w-full text-left text-sm">
                <thead className="border-b border-border/70 bg-cream/50 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                  <tr>
                    <th className="px-5 py-3">User</th>
                    <th className="px-5 py-3">Role</th>
                    <th className="px-5 py-3">Access Level</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {orgUsers.map((user) => (
                    <tr key={user.id} className="bg-white">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-ink">{user.fullName}</p>
                        <p className="mt-0.5 text-xs text-muted">{user.email}</p>
                        <p className="mt-0.5 text-xs text-muted">{user.title}</p>
                      </td>
                      <td className="px-5 py-4 text-ink">{user.role}</td>
                      <td className="px-5 py-4">
                        <select
                          aria-label={`Access level for ${user.fullName}`}
                          value={user.active ? user.accessLevel : "No Access"}
                          onChange={(event) =>
                            handleAccessChange(user.id, event.target.value)
                          }
                          disabled={user.id === "ou-001"}
                          className="w-full max-w-[13rem] cursor-pointer rounded-lg border border-border/80 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {employerAccessLevels.map((level) => (
                            <option key={level} value={level}>
                              {level}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                            user.active
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-stone-100 text-stone-600"
                          )}
                        >
                          {user.active ? (
                            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                          ) : null}
                          {user.active ? "Active" : "Revoked"}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {user.id === "ou-001" ? (
                          <span className="text-xs text-muted">Current admin</span>
                        ) : user.active ? (
                          <Button
                            variant="outline"
                            className="px-3 py-1.5 text-xs"
                            onClick={() =>
                              handleAccessChange(user.id, "No Access")
                            }
                          >
                            Revoke
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            className="px-3 py-1.5 text-xs"
                            onClick={() => handleRestoreAccess(user.id)}
                          >
                            Grant access
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-border/60 bg-cream-deep/70 px-5 py-3.5 sm:px-6">
              <p className="text-sm font-medium text-ink">
                Active users:{" "}
                <span className="font-semibold">{activeUsers.length}</span>
                {" · "}
                Revoked:{" "}
                <span className="font-semibold">{revokedUsers.length}</span>
                {" · "}
                Account ID:{" "}
                <span className="font-semibold">{currentEmployer.accountId}</span>
              </p>
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-ink">
              Permission Audit Log
            </h2>
            <ul className="divide-y divide-border/60">
              {auditLog.map((entry) => (
                <li key={entry.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">
                      {entry.action}
                    </p>
                    <p className="text-xs tabular-nums text-muted">{entry.at}</p>
                  </div>
                  <p className="mt-1 text-sm text-ink">{entry.detail}</p>
                  <p className="mt-0.5 text-xs text-muted">By {entry.actor}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
