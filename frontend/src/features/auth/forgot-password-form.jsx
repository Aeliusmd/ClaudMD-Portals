"use client";

import { Suspense, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Info } from "lucide-react";
import { AuthSplitShell } from "@/features/auth/auth-split-shell";
import { getLoginHref, resolveActivationKey } from "@/lib/portal-paths";

function ForgotPasswordFormInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const searchParams = useSearchParams();
  const pathActivationKey = Array.isArray(params?.activationKey)
    ? params.activationKey[0]
    : params?.activationKey;
  const activationKey = resolveActivationKey({
    searchParams,
    pathname,
    pathKey: pathActivationKey,
  });
  const sharedId = (
    searchParams.get("sharedid") ||
    searchParams.get("sharedId") ||
    ""
  ).trim();

  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const loginHref = getLoginHref({
    portal: "outsider",
    activationKey,
    sharedId,
  });

  function handleSkip() {
    router.push(loginHref);
  }

  function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    // Backend email send comes later — UI only for now.
    setSubmitted(true);
  }

  const inputClassName =
    "w-full rounded-lg border border-[#d8dce3] bg-white px-3.5 py-2.5 text-[0.9375rem] text-ink outline-none transition placeholder:text-[#b0b6bf] focus:border-primary focus:ring-2 focus:ring-primary/15 sm:py-3";

  return (
    <AuthSplitShell>
      <h2 className="font-heading text-[1.85rem] leading-[1.15] font-bold text-foreground-900 sm:text-[2.35rem]">
        Forgot password
      </h2>
      <p className="mt-2 font-body text-sm text-foreground-500 sm:text-[0.9375rem]">
        Enter the email from your invitation. We&apos;ll send reset instructions
        when email delivery is enabled.
      </p>

      {submitted ? (
        <div className="mt-6 rounded-lg border border-sky-200 bg-sky-50 px-3.5 py-3 text-sm text-sky-900">
          If an account exists for{" "}
          <span className="font-semibold">{email.trim()}</span>, a reset link
          will be sent. You can skip and sign in with your temporary password.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4 sm:mt-8">
          <label className="block space-y-2" htmlFor="forgot-email">
            <span className="font-sans text-sm font-semibold text-[#2f2a26]">
              Email
            </span>
            <input
              id="forgot-email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className={inputClassName}
            />
          </label>

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
            className="inline-flex w-full cursor-pointer items-center justify-center rounded-lg bg-primary-500 px-4 py-3 font-sans text-[0.9375rem] font-semibold text-white transition hover:bg-primary-600 sm:py-3.5"
          >
            Send reset link
          </button>
        </form>
      )}

      <button
        type="button"
        onClick={handleSkip}
        className="mt-4 inline-flex w-full cursor-pointer items-center justify-center rounded-lg border border-[#d8dce3] bg-white px-4 py-3 font-sans text-[0.9375rem] font-semibold text-ink transition hover:bg-cream sm:py-3.5"
      >
        Skip for now
      </button>

      <button
        type="button"
        onClick={handleSkip}
        className="mt-5 w-full text-center font-sans text-sm font-medium text-[#9aa0a8] transition hover:text-ink"
      >
        ← Back to login
      </button>
    </AuthSplitShell>
  );
}

export function ForgotPasswordForm() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-dvh items-center justify-center bg-white text-sm text-muted">
          Loading…
        </div>
      }
    >
      <ForgotPasswordFormInner />
    </Suspense>
  );
}
