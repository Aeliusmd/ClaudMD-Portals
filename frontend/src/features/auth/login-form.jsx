"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowRight, HeartPulse, Info } from "lucide-react";
import {
  findSecureShare,
  isSecureShareExpired,
} from "@/data/secure-shares";
import {
  clearSecureShareSession,
  getSecureShareSession,
  resolvePostLoginDestination,
  saveSecureShareSession,
} from "@/lib/secure-share-session";

const DEMO_ACCOUNTS = [
  "patient@demo.com",
  "employer@demo.com",
  "insurance@demo.com",
  "outsider@demo.com",
];

const ERROR_MISSING = "Please enter both email and password.";
const ERROR_INVALID =
  "Invalid credentials. Please use a recognized email address.";

function LoginFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shareToken = searchParams.get("share") || "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [shareBanner, setShareBanner] = useState(null);

  useEffect(() => {
    if (!shareToken) {
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
  }, [shareToken]);

  function clearError() {
    if (error) setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isSigningIn) return;

    const normalizedEmail = email.trim().toLowerCase();
    const hasEmail = Boolean(normalizedEmail);
    const hasPassword = Boolean(password);

    if (!hasEmail || !hasPassword) {
      setError(ERROR_MISSING);
      return;
    }

    if (!DEMO_ACCOUNTS.includes(normalizedEmail)) {
      setError(ERROR_INVALID);
      return;
    }

    const portalRoutes = {
      "patient@demo.com": "/patient/dashboard",
      "employer@demo.com": "/employer/dashboard",
    };

    const defaultDestination = portalRoutes[normalizedEmail];
    if (!defaultDestination) {
      setError(ERROR_INVALID);
      return;
    }

    setError("");
    setIsSigningIn(true);

    const shareSession = getSecureShareSession();
    const share =
      shareSession && findSecureShare(shareSession.token)
        ? findSecureShare(shareSession.token)
        : null;
    const shareValid = Boolean(share && !isSecureShareExpired(share));

    const destination = resolvePostLoginDestination({
      email: normalizedEmail,
      defaultDestination,
      shareSession: shareValid ? shareSession : null,
      isShareExpired: !shareValid,
    });

    // Normal login must not keep scoped session (US-4.3).
    if (destination === defaultDestination) {
      clearSecureShareSession();
    } else if (share) {
      saveSecureShareSession(share);
    }

    await new Promise((resolve) => setTimeout(resolve, 900));
    router.push(destination);
  }

  const inputClassName =
    "w-full rounded-lg border border-[#d8dce3] bg-white px-3.5 py-2.5 text-[0.9375rem] text-ink outline-none transition placeholder:text-[#b0b6bf] focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-70 sm:py-3";

  return (
    <div className="grid h-full min-h-0 w-full grid-cols-1 overflow-hidden lg:grid-cols-2">
      <section className="relative hidden min-h-0 flex-col bg-primary text-white lg:flex">
        <div className="flex min-h-0 flex-1 flex-col px-10 py-8 xl:px-16 xl:py-12">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-white/20">
              <HeartPulse className="h-5 w-5 text-white" strokeWidth={2.25} />
            </div>
            <span className="font-display text-[1.35rem] font-bold tracking-tight text-white">
              ClaudMD
            </span>
          </div>

          <div className="flex min-h-0 flex-1 flex-col justify-center py-8">
            <div className="max-w-md">
              <h1 className="font-display text-4xl leading-[1.12] font-bold text-white xl:text-[3.1rem]">
                Unified Healthcare Portal
              </h1>
              <p className="mt-5 max-w-[26rem] font-sans text-base leading-[1.65] text-white/90 xl:text-[1.05rem]">
                Securely access your healthcare information, manage appointments,
                and review documents all in one place.
              </p>
            </div>
          </div>

          <p className="font-sans text-sm text-white/70">
            © 2026 ClaudMD Healthcare Systems
          </p>
        </div>
      </section>

      <section className="flex min-h-0 flex-col overflow-y-auto overscroll-contain bg-white">
        <div className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center sm:px-8 sm:py-10 md:px-10">
          <div className="w-full max-w-[392px]">
            <div className="mb-7 flex items-center gap-2.5 sm:mb-8 lg:hidden">
              <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-primary text-white sm:h-10 sm:w-10">
                <HeartPulse className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.25} />
              </div>
              <span className="font-display text-lg font-bold tracking-tight text-ink sm:text-xl">
                ClaudMD
              </span>
            </div>

            <h2 className="font-display text-[1.85rem] leading-[1.15] font-bold text-ink sm:text-[2.35rem] md:text-[2.5rem]">
              Welcome back
            </h2>
            <p className="mt-2 font-sans text-sm text-muted sm:mt-2.5 sm:text-[0.9375rem]">
              Enter your credentials to access your secure portal.
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
                    href="/forgot-password"
                    className="shrink-0 font-sans text-sm font-semibold text-primary hover:text-primary-dark"
                  >
                    Forgot password?
                  </Link>
                </div>
                <input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearError();
                  }}
                  autoComplete="current-password"
                  disabled={isSigningIn}
                  className={inputClassName}
                />
              </div>

              <div className="rounded-xl bg-[#faf5f0] px-3.5 py-3 sm:px-4 sm:py-3.5">
                <p className="mb-2 font-sans text-sm font-medium text-[#4a4540]">
                  Demo accounts (use any password):
                </p>
                <ul className="space-y-1 font-sans text-sm font-normal text-[#5c5650]">
                  {DEMO_ACCOUNTS.map((account) => (
                    <li key={account} className="leading-relaxed">
                      • {account}
                    </li>
                  ))}
                </ul>
              </div>

              {error ? (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-lg border border-[#f1c0c0] bg-[#fdecec] px-3.5 py-3"
                >
                  <Info
                    className="mt-0.5 h-4 w-4 shrink-0 text-[#c23b3b]"
                    strokeWidth={2.25}
                  />
                  <p className="font-sans text-sm font-medium text-[#c23b3b]">
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
                    : "bg-primary hover:bg-primary-dark"
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

export function LoginForm() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-dvh items-center justify-center bg-white text-sm text-muted">
          Loading…
        </div>
      }
    >
      <LoginFormInner />
    </Suspense>
  );
}
