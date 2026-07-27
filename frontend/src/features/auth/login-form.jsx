"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, HeartPulse, Info } from "lucide-react";

const DEMO_ACCOUNTS = [
  "patient@demo.com",
  "employer@demo.com",
  "insurance@demo.com",
  "outsider@demo.com",
];

const ERROR_MISSING = "Please enter both email and password.";
const ERROR_INVALID =
  "Invalid credentials. Please use a recognized email address.";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);

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

    const destination = portalRoutes[normalizedEmail];
    if (!destination) {
      setError(ERROR_INVALID);
      return;
    }

    setError("");
    setIsSigningIn(true);

    await new Promise((resolve) => setTimeout(resolve, 900));
    router.push(destination);
  }

  return (
    <div className="fixed inset-0 grid w-full grid-cols-1 overflow-hidden lg:grid-cols-2">
      <section className="hidden h-full flex-col justify-between bg-[#1d78d6] px-12 py-10 text-white lg:flex xl:px-16">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-white/20">
            <HeartPulse className="h-5 w-5 text-white" strokeWidth={2.25} />
          </div>
          <span className="font-sans text-[1.25rem] font-semibold tracking-[-0.01em] text-white">
            ClaudMD
          </span>
        </div>

        <div className="max-w-[28rem]">
          <h1 className="font-display text-[3.1rem] leading-[1.12] font-bold text-white">
            Unified Healthcare Portal
          </h1>
          <p className="mt-5 font-sans text-[1.05rem] leading-[1.65] font-normal text-white/90">
            Securely access your healthcare information, manage appointments,
            and review documents all in one place.
          </p>
        </div>

        <p className="font-sans text-[0.85rem] font-normal text-white/70">
          © 2026 ClaudMD Healthcare Systems
        </p>
      </section>

      <section className="flex h-full items-center justify-center overflow-y-auto bg-white px-6 py-10 sm:px-10">
        <div className="w-full max-w-[24.5rem]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#1d78d6] text-white">
              <HeartPulse className="h-4 w-4" strokeWidth={2.25} />
            </div>
            <span className="font-sans text-lg font-semibold text-[#1c1917]">
              ClaudMD
            </span>
          </div>

          <h2 className="font-display text-[2.4rem] leading-[1.15] font-bold text-[#1c1917]">
            Welcome back
          </h2>
          <p className="mt-2.5 font-sans text-[0.95rem] font-normal text-[#8a8f98]">
            Enter your credentials to access your secure portal.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <label className="block space-y-2" htmlFor="email">
              <span className="font-sans text-[0.875rem] font-semibold text-[#2f2a26]">
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
                className="w-full rounded-lg border border-[#d8dce3] bg-white px-3.5 py-[0.85rem] font-sans text-[0.95rem] text-[#1c1917] outline-none transition placeholder:font-normal placeholder:text-[#b0b6bf] focus:border-[#1d78d6] focus:ring-2 focus:ring-[#1d78d6]/15 disabled:opacity-70"
              />
            </label>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor="password"
                  className="font-sans text-[0.875rem] font-semibold text-[#2f2a26]"
                >
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="font-sans text-[0.875rem] font-semibold text-[#1d78d6] hover:text-[#1666b5]"
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
                className="w-full rounded-lg border border-[#d8dce3] bg-white px-3.5 py-[0.85rem] font-sans text-[0.95rem] text-[#1c1917] outline-none transition placeholder:font-normal placeholder:text-[#b0b6bf] focus:border-[#1d78d6] focus:ring-2 focus:ring-[#1d78d6]/15 disabled:opacity-70"
              />
            </div>

            <div className="rounded-xl bg-[#faf5f0] px-4 py-3.5">
              <p className="mb-2 font-sans text-[0.875rem] font-medium text-[#4a4540]">
                Demo accounts (use any password):
              </p>
              <ul className="space-y-1.5 font-sans text-[0.875rem] font-normal text-[#5c5650]">
                {DEMO_ACCOUNTS.map((account) => (
                  <li key={account}>• {account}</li>
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
                <p className="font-sans text-[0.875rem] font-medium text-[#c23b3b]">
                  {error}
                </p>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSigningIn}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-[0.9rem] font-sans text-[0.95rem] font-semibold text-white transition ${
                isSigningIn
                  ? "cursor-wait bg-[#5ba3e8]"
                  : "bg-[#1d78d6] hover:bg-[#1666b5]"
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
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <p className="mt-7 text-center font-sans text-[0.75rem] font-normal text-[#9aa0a8]">
            By logging in, you agree to our{" "}
            <a href="#" className="font-medium text-[#1d78d6]">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="#" className="font-medium text-[#1d78d6]">
              Privacy Notice
            </a>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
