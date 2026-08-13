"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, HeartPulse, Info } from "lucide-react";
import {
  findSecureShare,
  isSecureShareExpired,
} from "@/data/secure-shares";
import { loginWithCredentials, resolvePortalDestination } from "@/lib/api/auth";
import { saveAuthSession } from "@/lib/auth-session";
import {
  outsiderPaths,
  resolvePortalFromPathname,
} from "@/lib/portal-paths";
import {
  clearSecureShareSession,
  getSecureShareSession,
  resolvePostLoginDestination,
  saveSecureShareSession,
} from "@/lib/secure-share-session";

const ERROR_MISSING = "Please enter both email and password.";
const ERROR_ACTIVATION =
  "Missing activation key. Open the link from your invitation email.";
const ERROR_GENERIC = "Unable to sign in. Please check your credentials.";

function LoginFormInner({ portal = "employer" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // URL path is source of truth: /employerportal | /patientportal | /insuranceportal
  const portalFromUrl = resolvePortalFromPathname(pathname) || portal;
  const shareToken = searchParams.get("share") || "";
  const sharedId = (
    searchParams.get("sharedid") ||
    searchParams.get("sharedId") ||
    ""
  ).trim();
  const activationKey = (
    searchParams.get("activationkey") ||
    searchParams.get("activationKey") ||
    ""
  ).trim();
  const hasActivationKey = Boolean(activationKey);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordUnlocked, setPasswordUnlocked] = useState(false);
  const [error, setError] = useState(
    hasActivationKey ? "" : ERROR_ACTIVATION
  );
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [shareBanner, setShareBanner] = useState(null);

  useEffect(() => {
    if (!hasActivationKey) {
      setError(ERROR_ACTIVATION);
    }
  }, [hasActivationKey]);

  useEffect(() => {
    // Prefer live SharedDocuments.SharedId links from ClaudMD emails.
    if (sharedId) {
      saveSecureShareSession({
        sharedId,
        recipientRole: portalFromUrl,
      });
      setShareBanner({
        tone: "info",
        message:
          "Secure shared report ready. Sign in to view the document.",
      });
      return;
    }

    if (!shareToken) {
      // Normal activation-key login must not keep a prior shared-doc scoped session.
      clearSecureShareSession();
      setShareBanner(null);
      return;
    }

    const share = findSecureShare(shareToken);
    if (!share) {
      clearSecureShareSession();
      setShareBanner({
        tone: "error",
        message: "This secure report link is invalid or no longer available.",
      });
      return;
    }

    if (isSecureShareExpired(share)) {
      clearSecureShareSession();
      setShareBanner({
        tone: "error",
        message:
          "This secure report link has expired. Sign in normally or request a new share.",
      });
      return;
    }

    // Retain report context through authentication (US-4.2).
    saveSecureShareSession(share);
    setShareBanner({
      tone: "info",
      message: `Secure report ready for ${share.patientName} — ${share.reportType}. Sign in to continue.`,
    });
  }, [shareToken, sharedId, portalFromUrl]);

  function clearError() {
    if (!error) return;
    // Keep the activation-key message until the URL includes activationkey.
    if (!hasActivationKey) {
      setError(ERROR_ACTIVATION);
      return;
    }
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSigningIn) return;

    const normalizedEmail = email.trim();
    const normalizedPassword = password.trim();
    const hasEmail = Boolean(normalizedEmail);
    const hasPassword = Boolean(normalizedPassword);

    if (!activationKey) {
      setError(ERROR_ACTIVATION);
      return;
    }

    if (!hasEmail || !hasPassword) {
      setError(ERROR_MISSING);
      return;
    }

    setError("");
    setIsSigningIn(true);

    try {
      const result = await loginWithCredentials({
        username: normalizedEmail,
        password: normalizedPassword,
        activationKey,
        portal: portalFromUrl,
      });

      // API already validates portal access; prefer returned portal, else login URL.
      const resolvedPortal = result.user?.portal || portalFromUrl;

      const sessionUser = {
        ...result.user,
        portal: resolvedPortal,
      };

      saveAuthSession({
        accessToken: result.access_token,
        refreshToken: result.refresh_token || null,
        tokenType: result.token_type || "Bearer",
        expiresIn: result.expires_in || null,
        scope: result.scope || null,
        user: sessionUser,
        clinic: result.clinic,
      });

      const defaultDestination = resolvePortalDestination(resolvedPortal);
      // Only honor sharedid from the current login URL (not a leftover session).
      const liveSharedId = (sharedId || "").trim();
      const shareSession = getSecureShareSession();
      const mockShare =
        !liveSharedId && shareSession?.token
          ? findSecureShare(shareSession.token)
          : null;
      const shareValid = Boolean(
        liveSharedId || (mockShare && !isSecureShareExpired(mockShare))
      );

      const destination = resolvePostLoginDestination({
        email: (result.user?.email || normalizedEmail).toLowerCase(),
        defaultDestination,
        shareSession: shareValid
          ? liveSharedId
            ? { sharedId: liveSharedId, recipientRole: portalFromUrl }
            : shareSession
          : null,
        isShareExpired: !shareValid,
      });

      // Normal login must not keep scoped session (US-4.3).
      if (destination === defaultDestination) {
        clearSecureShareSession();
      } else if (liveSharedId) {
        saveSecureShareSession({
          sharedId: liveSharedId,
          recipientRole: portalFromUrl,
        });
      } else if (mockShare) {
        saveSecureShareSession(mockShare);
      }

      const mustChangePassword = Boolean(
        result.user?.must_change_password ?? result.user?.mustChangePassword
      );
      if (resolvedPortal === "outsider" && mustChangePassword) {
        const nextParams = new URLSearchParams();
        nextParams.set("next", destination);
        if (activationKey) nextParams.set("activationkey", activationKey);
        router.push(`${outsiderPaths.changePassword}?${nextParams.toString()}`);
        return;
      }

      router.push(destination);
    } catch (err) {
      setError(err?.message || ERROR_GENERIC);
      setIsSigningIn(false);
    }
  }

  const forgotHref = (() => {
    if (portalFromUrl !== "outsider") return "/forgot-password";
    const forgotParams = new URLSearchParams();
    if (activationKey) forgotParams.set("activationkey", activationKey);
    if (sharedId) forgotParams.set("sharedid", sharedId);
    const query = forgotParams.toString();
    return query
      ? `${outsiderPaths.forgotPassword}?${query}`
      : outsiderPaths.forgotPassword;
  })();

  const inputClassName =
    "w-full rounded-lg border border-[#d8dce3] bg-white px-3.5 py-2.5 text-[0.9375rem] text-ink outline-none transition placeholder:text-[#b0b6bf] focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-70 sm:py-3";

  return (
    <div className="grid h-full min-h-0 w-full grid-cols-1 overflow-hidden lg:grid-cols-2">
      <section className="relative hidden min-h-0 flex-col bg-primary-500 text-white lg:flex">
        <div className="flex min-h-0 flex-1 flex-col px-10 py-8 xl:px-16 xl:py-12">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-white/20">
              <HeartPulse className="h-5 w-5 text-white" strokeWidth={2.25} />
            </div>
            <span className="font-heading text-[1.35rem] font-bold tracking-tight text-white">
              ClaudMD
            </span>
          </div>

          <div className="flex min-h-0 flex-1 flex-col justify-center py-8">
            <div className="max-w-md">
              <h1 className="font-heading text-4xl leading-[1.12] font-bold text-white xl:text-[3.1rem]">
                Unified Healthcare Portal
              </h1>
              <p className="mt-5 max-w-[26rem] font-body text-base leading-[1.65] text-white/90 xl:text-[1.05rem]">
                Securely access your healthcare information, manage appointments,
                and review documents all in one place.
              </p>
            </div>
          </div>

          <p className="font-body text-sm text-white/70">
            © 2026 ClaudMD Healthcare Systems
          </p>
        </div>
      </section>

      <section className="flex min-h-0 flex-col overflow-y-auto overscroll-contain bg-white">
        <div className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center sm:px-8 sm:py-10 md:px-10">
          <div className="w-full max-w-[392px]">
            <div className="mb-7 flex items-center gap-2.5 sm:mb-8 lg:hidden">
              <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-primary-500 text-white sm:h-10 sm:w-10">
                <HeartPulse className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.25} />
              </div>
              <span className="font-heading text-lg font-bold tracking-tight text-foreground-900 sm:text-xl">
                ClaudMD
              </span>
            </div>

            <h2 className="font-heading text-[1.85rem] leading-[1.15] font-bold text-foreground-900 sm:text-[2.35rem] md:text-[2.5rem]">
              Welcome back
            </h2>
            <p className="mt-2 font-body text-sm text-foreground-500 sm:mt-2.5 sm:text-[0.9375rem]">
              {hasActivationKey
                ? "Enter your credentials to access your secure portal."
                : "Open the secure portal link from your invitation email to continue."}
            </p>

            {shareBanner ? (
              <div
                role="status"
                className={`mt-4 rounded-lg border px-3.5 py-3 text-sm ${
                  shareBanner.tone === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-800"
                    : "border-sky-200 bg-sky-50 text-sky-900"
                }`}
              >
                {shareBanner.message}
              </div>
            ) : null}

            {!hasActivationKey ? (
              <div
                role="alert"
                className="mt-6 flex items-start gap-2.5 rounded-lg border border-accent-100 bg-accent-50 px-3.5 py-3 sm:mt-8"
              >
                <Info
                  className="mt-0.5 h-4 w-4 shrink-0 text-accent-600"
                  strokeWidth={2.25}
                />
                <p className="font-sans text-sm font-medium text-accent-600">
                  {ERROR_ACTIVATION}
                </p>
              </div>
            ) : (
            <form
              onSubmit={handleSubmit}
              className="mt-6 space-y-4 sm:mt-8 sm:space-y-5"
            >
              <label className="block space-y-2" htmlFor="email">
                <span className="font-sans text-sm font-semibold text-[#2f2a26]">
                  Email or Username
                </span>
                <input
                  id="email"
                  type="text"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearError();
                  }}
                  autoComplete="username"
                  disabled={isSigningIn}
                  className={inputClassName}
                />
              </label>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label
                    htmlFor="password"
                    className="font-sans text-sm font-semibold text-[#2f2a26]"
                  >
                    Password
                  </label>
                  <Link
                    href={forgotHref}
                    className="shrink-0 font-sans text-sm font-semibold text-primary hover:text-primary-dark"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    readOnly={!passwordUnlocked}
                    onFocus={() => setPasswordUnlocked(true)}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      clearError();
                    }}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    disabled={isSigningIn}
                    className={`${inputClassName} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    disabled={isSigningIn}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer rounded p-0.5 text-foreground-500 transition hover:text-foreground-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" strokeWidth={2.25} />
                    ) : (
                      <Eye className="h-4 w-4" strokeWidth={2.25} />
                    )}
                  </button>
                </div>
              </div>

              {error ? (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-lg border border-accent-100 bg-accent-50 px-3.5 py-3"
                >
                  <Info
                    className="mt-0.5 h-4 w-4 shrink-0 text-accent-600"
                    strokeWidth={2.25}
                  />
                  <p className="font-sans text-sm font-medium text-accent-600">
                    {error}
                  </p>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSigningIn}
                className={`inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-3 font-sans text-[0.9375rem] font-semibold text-white transition sm:py-3.5 ${
                  isSigningIn
                    ? "cursor-wait bg-[#5ba3e8]"
                    : "bg-primary-500 hover:bg-primary-600"
                }`}
              >
                {isSigningIn ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white"
                    />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
                  </>
                )}
              </button>
            </form>
            )}

            <p className="mt-6 text-center font-sans text-xs leading-relaxed text-[#9aa0a8] sm:mt-8">
              By logging in, you agree to our{" "}
              <a
                href="#"
                className="font-medium text-primary hover:text-primary-dark"
              >
                Terms of Service
              </a>{" "}
              and{" "}
              <a
                href="#"
                className="font-medium text-primary hover:text-primary-dark"
              >
                Privacy Notice
              </a>
              .
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export function LoginForm({ portal = "employer" }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-dvh items-center justify-center bg-white text-sm text-muted">
          Loading…
        </div>
      }
    >
      <LoginFormInner portal={portal} />
    </Suspense>
  );
}
