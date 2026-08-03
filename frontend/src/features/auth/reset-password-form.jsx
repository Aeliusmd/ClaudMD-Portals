"use client";

import Link from "next/link";
import { useState } from "react";
import { HeartPulse } from "lucide-react";

export function ResetPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    setSubmitted(true);
  }

  return (
    <div className="flex h-full w-full items-center justify-center overflow-y-auto bg-[#fcf8f1] px-6 py-10">
      <div className="w-full max-w-[24.5rem] text-center">
        <div className="mb-9 flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#1d78d6] text-white">
            <HeartPulse className="h-5 w-5" strokeWidth={2.25} />
          </div>
          <span className="font-display text-[1.7rem] font-bold tracking-[-0.02em] text-[#111]">
            ClaudMD
          </span>
        </div>

        <h1 className="font-display text-[2.45rem] leading-[1.15] font-bold text-[#111]">
          Reset Password
        </h1>
        <p className="mt-3 font-sans text-[0.95rem] font-normal text-[#8a8f98]">
          Enter your email and we&apos;ll send you a reset link.
        </p>

        {submitted ? (
          <div className="mt-8 rounded-xl border border-[#d8dce3] bg-white px-5 py-6 text-left">
            <p className="font-sans text-sm font-semibold text-[#2f2a26]">
              Reset link sent (demo)
            </p>
            <p className="mt-2 font-sans text-sm font-normal text-[#8a8f98]">
              If an account exists for{" "}
              <span className="font-medium text-[#2f2a26]">{email.trim()}</span>,
              a password reset link would be sent. This is a frontend-only demo.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-5 text-left">
            <label className="block space-y-2" htmlFor="reset-email">
              <span className="font-sans text-[0.875rem] font-semibold text-[#2f2a26]">
                Email Address
              </span>
              <input
                id="reset-email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="w-full rounded-lg border border-[#d8dce3] bg-white px-3.5 py-[0.85rem] font-sans text-[0.95rem] text-[#1c1917] outline-none transition placeholder:font-normal placeholder:text-[#b0b6bf] focus:border-[#1d78d6] focus:ring-2 focus:ring-[#1d78d6]/15"
              />
            </label>

            {error ? (
              <p className="font-sans text-sm font-medium text-rose-600">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-lg bg-[#1d78d6] px-4 py-[0.9rem] font-sans text-[0.95rem] font-semibold text-white transition hover:bg-[#1666b5]"
            >
              Send Reset Link
            </button>
          </form>
        )}

        <Link
          href="/login"
          className="mt-8 inline-flex items-center justify-center font-sans text-[0.9rem] font-medium text-[#8a8f98] transition hover:text-[#2f2a26]"
        >
          ← Back to login
        </Link>
      </div>
    </div>
  );
}
