"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Info } from "lucide-react";
import { AuthSplitShell } from "@/features/auth/auth-split-shell";
import { PasswordField } from "@/components/ui/password-field";
import { changePassword } from "@/lib/api/auth";
import { getAccessToken, markPasswordChanged } from "@/lib/auth-session";
import { outsiderPaths } from "@/lib/portal-paths";

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

function FirstLoginPasswordFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = (searchParams.get("next") || outsiderPaths.sharedDocuments).trim();

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const passwordDirty = useMemo(
    () =>
      Boolean(
        passwordForm.currentPassword ||
          passwordForm.newPassword ||
          passwordForm.confirmPassword
      ),
    [passwordForm]
  );

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace(outsiderPaths.login);
    }
  }, [router]);

  function clearFieldError(field) {
    setError("");
    setPasswordErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function handleSkip() {
    router.replace(nextPath || outsiderPaths.sharedDocuments);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;

    const errors = validatePassword(passwordForm);
    setPasswordErrors(errors);
    if (Object.keys(errors).length > 0) {
      setError("Please fix the password fields before updating.");
      return;
    }

    const token = getAccessToken();
    if (!token) {
      router.replace(outsiderPaths.login);
      return;
    }

    setError("");
    setSaving(true);
    try {
      await changePassword({
        accessToken: token,
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
        confirmPassword: passwordForm.confirmPassword,
      });
      markPasswordChanged();
      router.replace(nextPath || outsiderPaths.sharedDocuments);
    } catch (err) {
      if (err?.status === 401) {
        router.replace(outsiderPaths.login);
        return;
      }
      setError(err?.message || "Unable to update password.");
      setSaving(false);
    }
  }

  return (
    <AuthSplitShell>
      <h2 className="font-heading text-[1.85rem] leading-[1.15] font-bold text-foreground-900 sm:text-[2.35rem]">
        Change password
      </h2>
      <p className="mt-2 font-body text-sm text-foreground-500 sm:text-[0.9375rem]">
        For security, please replace your temporary password. You can skip this
        step and do it later.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4 sm:mt-8">
        <PasswordField
          id="current-password"
          label="Current Password"
          value={passwordForm.currentPassword}
          autoComplete="current-password"
          disabled={saving}
          error={passwordErrors.currentPassword}
          onChange={(value) => {
            setPasswordForm((prev) => ({ ...prev, currentPassword: value }));
            clearFieldError("currentPassword");
          }}
        />
        <PasswordField
          id="new-password"
          label="New Password"
          value={passwordForm.newPassword}
          autoComplete="new-password"
          disabled={saving}
          error={passwordErrors.newPassword}
          onChange={(value) => {
            setPasswordForm((prev) => ({ ...prev, newPassword: value }));
            clearFieldError("newPassword");
          }}
        />
        <PasswordField
          id="confirm-password"
          label="Confirm New Password"
          value={passwordForm.confirmPassword}
          autoComplete="new-password"
          disabled={saving}
          error={passwordErrors.confirmPassword}
          onChange={(value) => {
            setPasswordForm((prev) => ({ ...prev, confirmPassword: value }));
            clearFieldError("confirmPassword");
          }}
        />

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-accent-100 bg-accent-50 px-3.5 py-3"
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" />
            <p className="font-sans text-sm font-medium text-accent-600">
              {error}
            </p>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={saving || !passwordDirty}
          className={`inline-flex w-full items-center justify-center rounded-lg px-4 py-3 font-sans text-[0.9375rem] font-semibold text-white transition sm:py-3.5 ${
            saving || !passwordDirty
              ? "cursor-not-allowed bg-[#5ba3e8]"
              : "cursor-pointer bg-primary-500 hover:bg-primary-600"
          }`}
        >
          {saving ? "Updating…" : "Update Password"}
        </button>
      </form>

      <button
        type="button"
        onClick={handleSkip}
        disabled={saving}
        className="mt-4 inline-flex w-full cursor-pointer items-center justify-center rounded-lg border border-[#d8dce3] bg-white px-4 py-3 font-sans text-[0.9375rem] font-semibold text-ink transition hover:bg-cream disabled:opacity-60 sm:py-3.5"
      >
        Skip for now
      </button>
    </AuthSplitShell>
  );
}

export function FirstLoginPasswordForm() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-dvh items-center justify-center bg-white text-sm text-muted">
          Loading…
        </div>
      }
    >
      <FirstLoginPasswordFormInner />
    </Suspense>
  );
}
