"use client";

import Link from "next/link";
import {
  DEMO_EXPIRED_SHARE_TOKEN,
  DEMO_SECURE_SHARE_TOKEN,
  findSecureShare,
} from "@/data/secure-shares";
import { LOGIN_PATH } from "@/lib/auth-routes";

/**
 * Demo-only stand-in for the ClaudMD (main app) secure share email (US-4.1).
 * This portals app does not send real email — use these links to exercise Epic 4.
 */
export default function DemoSecureEmailPage() {
  const active = findSecureShare(DEMO_SECURE_SHARE_TOKEN);
  const expired = findSecureShare(DEMO_EXPIRED_SHARE_TOKEN);

  return (
    <div className="min-h-dvh bg-[#eef1f5] px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-muted uppercase">
            Demo · Epic 4
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">
            ClaudMD secure report email
          </h1>
          <p className="mt-2 text-sm text-muted">
            Simulates the email ClaudMD sends when a report is shared. The body
            only includes patient name and report type (no full PHI). Click the
            link to open this portal&apos;s login — not the report itself.
          </p>
        </div>

        <article className="overflow-hidden rounded-2xl border border-border/70 bg-white shadow-sm">
          <header className="border-b border-border/60 bg-[#f8fafc] px-5 py-4">
            <p className="text-xs text-muted">From</p>
            <p className="text-sm font-semibold text-ink">
              ClaudMD Reports &lt;noreply@claudmd.example&gt;
            </p>
            <p className="mt-2 text-xs text-muted">To</p>
            <p className="text-sm text-ink">{active?.recipientEmail}</p>
            <p className="mt-2 text-xs text-muted">Subject</p>
            <p className="text-sm font-semibold text-ink">
              New shared report: {active?.patientName} — {active?.reportType}
            </p>
          </header>
          <div className="space-y-4 px-5 py-5 text-sm leading-relaxed text-ink">
            <p>Hello,</p>
            <p>
              ClaudMD has shared a new report with you.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-muted">
              <li>
                <span className="text-ink">Patient:</span> {active?.patientName}
              </li>
              <li>
                <span className="text-ink">Report type:</span>{" "}
                {active?.reportType}
              </li>
            </ul>
            <p className="text-muted">
              For privacy, this message does not include clinical details. Sign
              in through the secure link below to view the report. The link
              expires after a limited period.
            </p>
            <p>
              <Link
                href={`/share/${DEMO_SECURE_SHARE_TOKEN}`}
                className="inline-flex cursor-pointer rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark"
              >
                View secure report
              </Link>
            </p>
            <p className="break-all text-xs text-muted">
              Or copy:{" "}
              <code className="rounded bg-cream px-1 py-0.5">
                /share/{DEMO_SECURE_SHARE_TOKEN}
              </code>
            </p>
          </div>
        </article>

        <article className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
          <p className="font-semibold">Expired link demo (US-4.1)</p>
          <p className="mt-1 text-amber-900/80">
            Open an expired share to confirm the portal blocks access.
          </p>
          <Link
            href={`/share/${DEMO_EXPIRED_SHARE_TOKEN}`}
            className="mt-3 inline-flex cursor-pointer font-semibold text-amber-900 underline-offset-2 hover:underline"
          >
            Try expired link ({expired?.token})
          </Link>
        </article>

        <p className="text-sm text-muted">
          After a normal{" "}
          <Link href={LOGIN_PATH} className="font-semibold text-primary">
            employer login
          </Link>{" "}
          (no secure link), the full employer portal remains unchanged.
        </p>
      </div>
    </div>
  );
}
