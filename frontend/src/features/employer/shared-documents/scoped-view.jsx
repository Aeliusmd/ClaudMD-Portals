"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, UserRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DocumentPreviewModal } from "@/components/ui/document-preview-modal";
import { employees, sharedDocuments } from "@/data/employer";
import {
  findSecureShare,
  isSecureShareExpired,
} from "@/data/secure-shares";
import { openDocumentInNewTab } from "@/lib/documents";
import {
  clearSecureShareSession,
  getSecureShareSession,
} from "@/lib/secure-share-session";

function formatDob(value) {
  if (!value) return "—";
  const asDate = new Date(value);
  if (!Number.isNaN(asDate.getTime())) {
    return asDate.toLocaleDateString("en-US");
  }
  return value;
}

function DemoField({ label, value }) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-ink">{value || "—"}</p>
    </div>
  );
}

/**
 * US-4.3 — Scoped Shared Documents view after secure-link login.
 * Shows only the single shared report + employee metadata from the email link.
 * Does not alter the full Shared Documents inbox used on normal login.
 */
export function EmployerScopedSharedDocumentsView() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);

  useEffect(() => {
    const active = getSecureShareSession();
    if (!active?.token) {
      router.replace("/login");
      return;
    }

    const share = findSecureShare(active.token);
    if (!share || isSecureShareExpired(share)) {
      clearSecureShareSession();
      router.replace("/login");
      return;
    }

    setSession(share);
    setReady(true);
  }, [router]);

  const employee = useMemo(
    () => employees.find((row) => row.id === session?.employeeId) || null,
    [session]
  );

  const document = useMemo(
    () =>
      sharedDocuments.find((doc) => doc.id === session?.sharedDocumentId) ||
      null,
    [session]
  );

  const visitRow = useMemo(() => {
    if (!session) return null;
    return {
      id: "scoped-visit",
      date: session.visitDate,
      label: session.visitLabel || "Visit",
    };
  }, [session]);

  if (!ready || !session || !employee || !document || !visitRow) {
    return (
      <div className="flex min-h-48 items-center justify-center text-sm text-muted">
        Loading shared report…
      </div>
    );
  }

  const previewLabel = document.previewLabel || "PT report";
  const shortLabel =
    document.previewBadge ||
    (document.documentType?.includes("Physical") ? "PR" : "DOC");

  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
        {employee.name}
      </h1>

      <Card className="p-5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sky-100 text-primary">
            <UserRound className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-ink">{employee.name}</p>
            <p className="mt-0.5 text-sm tabular-nums text-muted">
              {employee.patientId} · {employee.accountNo}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0 space-y-5">
          <Card className="p-5">
            <h2 className="mb-4 text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
              Employee Demographics
            </h2>
            <div className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
              <DemoField label="ID" value={employee.accountNo} />
              <DemoField label="Phone" value={employee.phone} />
              <DemoField
                label="DOB"
                value={formatDob(employee.dateOfBirth)}
              />
              <DemoField label="Gender" value={employee.gender} />
              <div className="sm:col-span-2">
                <DemoField label="Address" value={employee.address} />
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border/70 bg-cream/40 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                  <tr>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Visit</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-l-4 border-l-primary-500 bg-primary-50">
                    <td className="px-5 py-3.5 font-semibold tabular-nums text-ink">
                      {visitRow.date}
                    </td>
                    <td className="px-5 py-3.5 text-ink">{visitRow.label}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="h-fit w-fit max-w-full justify-self-start rounded-2xl bg-foreground-900 p-4 shadow-sm sm:p-5">
          <div className="w-[8.75rem] sm:w-[9.5rem]">
            <button
              type="button"
              onClick={() => setPreviewDocument(document)}
              className="flex aspect-[3/4] w-full cursor-pointer flex-col items-center justify-center rounded-xl bg-white shadow-sm transition hover:ring-2 hover:ring-primary-400/50"
            >
              <div className="flex h-14 w-12 flex-col items-center justify-center rounded-md bg-background-100 text-foreground-700">
                <FileText className="h-5 w-5" />
                <span className="mt-1 text-[10px] font-bold tracking-wide">
                  {shortLabel}
                </span>
              </div>
            </button>
            <p className="mt-2.5 text-center text-xs font-medium text-white sm:text-sm">
              {visitRow.date} {previewLabel}
            </p>
            <div className="mt-1.5 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => setPreviewDocument(document)}
                className="cursor-pointer text-xs font-semibold text-white/80 underline-offset-2 hover:text-white hover:underline"
              >
                Preview
              </button>
              <button
                type="button"
                onClick={() => openDocumentInNewTab(document.url)}
                className="cursor-pointer text-xs font-semibold text-white/80 underline-offset-2 hover:text-white hover:underline"
              >
                Download
              </button>
            </div>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-white/55">
              {document.documentType} · {document.provider}
            </p>
          </div>
        </div>
      </div>

      {previewDocument ? (
        <DocumentPreviewModal
          file={previewDocument}
          onClose={() => setPreviewDocument(null)}
        />
      ) : null}
    </div>
  );
}
