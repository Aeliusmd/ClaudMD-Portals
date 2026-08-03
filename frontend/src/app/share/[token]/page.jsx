"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import {
  findSecureShare,
  isSecureShareExpired,
} from "@/data/secure-shares";
import {
  clearSecureShareSession,
  getSecureShareLoginHref,
  saveSecureShareSession,
} from "@/lib/secure-share-session";

export default function SecureShareLandingPage() {
  const params = useParams();
  const router = useRouter();
  const token = typeof params?.token === "string" ? params.token : "";
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    if (!token) {
      setStatus("missing");
      return;
    }

    const share = findSecureShare(token);
    if (!share) {
      clearSecureShareSession();
      setStatus("missing");
      return;
    }

    if (isSecureShareExpired(share)) {
      clearSecureShareSession();
      setStatus("expired");
      return;
    }

    saveSecureShareSession(share);
    setStatus("redirecting");
    router.replace(getSecureShareLoginHref(share.token));
  }, [router, token]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-cream px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border/70 bg-white p-6 text-center shadow-sm sm:p-8">
        {status === "checking" || status === "redirecting" ? (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <h1 className="mt-4 font-display text-2xl font-semibold text-ink">
              Opening secure link
            </h1>
            <p className="mt-2 text-sm text-muted">
              Please sign in to view your shared report. No report content is
              shown until you authenticate.
            </p>
          </>
        ) : null}

        {status === "expired" ? (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-700">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-semibold text-ink">
              This link has expired
            </h1>
            <p className="mt-2 text-sm text-muted">
              For security, ClaudMD secure report links expire after a set
              period. Request a new share or sign in to the portal normally.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex cursor-pointer rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Go to login
            </Link>
          </>
        ) : null}

        {status === "missing" ? (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-700">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-semibold text-ink">
              Link not found
            </h1>
            <p className="mt-2 text-sm text-muted">
              This secure link is invalid or no longer available.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex cursor-pointer rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
            >
              Go to login
            </Link>
          </>
        ) : null}
      </div>
    </div>
  );
}
