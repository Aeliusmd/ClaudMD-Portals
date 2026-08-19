"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DocumentNameText } from "@/components/ui/document-name-text";
import { DocumentPreviewModal } from "@/components/ui/document-preview-modal";
import { PdfThumbnail } from "@/components/ui/pdf-thumbnail";
import { employees, sharedDocuments } from "@/data/employer";
import {
  findSecureShare,
  isSecureShareExpired,
} from "@/data/secure-shares";
import { fetchSharedDocumentBySharedId } from "@/lib/api/employer";
import { getAccessToken } from "@/lib/auth-session";
import { LOGIN_PATH } from "@/lib/auth-routes";
import {
  clearSecureShareSession,
  getSecureShareSession,
} from "@/lib/secure-share-session";
import { documentDisplayName } from "@/lib/document-labels";
import { SharedAtStamp } from "@/components/ui/shared-at-stamp";
import { formatDateMMDDYY, formatDateOfBirth } from "@/lib/dates";

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
 * Scoped Shared Documents view after secure-link login.
 * Live path: SharedDocuments.SharedId → DocumentUploads.FilePath via API.
 * Mock path: Epic 4 demo tokens (unchanged).
 */
export function EmployerScopedSharedDocumentsView() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [session, setSession] = useState(null);
  const [livePayload, setLivePayload] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);

  useEffect(() => {
    const active = getSecureShareSession();
    if (!active?.sharedId && !active?.token) {
      router.replace(LOGIN_PATH);
      return undefined;
    }

    let cancelled = false;

    async function load() {
      if (active.sharedId) {
        const token = getAccessToken();
        if (!token) {
          clearSecureShareSession();
          router.replace(LOGIN_PATH);
          return;
        }
        try {
          const detail = await fetchSharedDocumentBySharedId(
            token,
            active.sharedId
          );
          if (cancelled) return;
          setLivePayload(detail);
          setSession(active);
          setError(null);
          setReady(true);
        } catch (err) {
          if (cancelled) return;
          setError(err?.message || "Unable to load shared document.");
          setReady(true);
        }
        return;
      }

      const share = findSecureShare(active.token);
      if (!share || isSecureShareExpired(share)) {
        clearSecureShareSession();
        router.replace(LOGIN_PATH);
        return;
      }

      if (cancelled) return;
      setLivePayload(null);
      setSession(share);
      setError(null);
      setReady(true);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const employee = useMemo(() => {
    if (livePayload?.employee) {
      return {
        name: livePayload.employee.name,
        patientId: livePayload.employee.patientId,
        accountNo: livePayload.employee.accountNo,
        phone: livePayload.employee.phone,
        dateOfBirth: livePayload.employee.dateOfBirth,
        gender: livePayload.employee.gender,
        address: livePayload.employee.address,
      };
    }
    return employees.find((row) => row.id === session?.employeeId) || null;
  }, [livePayload, session]);

  const document = useMemo(() => {
    if (livePayload?.document) return livePayload.document;
    return (
      sharedDocuments.find((doc) => doc.id === session?.sharedDocumentId) ||
      null
    );
  }, [livePayload, session]);

  const visitRow = useMemo(() => {
    if (livePayload) {
      return {
        id: "scoped-visit",
        date: livePayload.visitDate || "—",
        label: livePayload.visitLabel || "Visit",
      };
    }
    if (!session) return null;
    return {
      id: "scoped-visit",
      date: session.visitDate,
      label: session.visitLabel || "Visit",
    };
  }, [livePayload, session]);

  if (!ready) {
    return (
      <div className="flex min-h-48 items-center justify-center text-sm text-muted">
        Loading shared report…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        {error}
      </div>
    );
  }

  if (!session || !employee || !document || !visitRow) {
    return (
      <div className="flex min-h-48 items-center justify-center text-sm text-muted">
        Loading shared report…
      </div>
    );
  }

  const docName = documentDisplayName(document);
  const dateLabel = formatDateMMDDYY(
    document.publishedAt || livePayload?.publishedAt || visitRow.date
  );

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
              {employee.patientId || "—"} · {employee.accountNo || "—"}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
        <div className="min-w-0 space-y-5">
          <Card className="p-5">
            <h2 className="mb-4 text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
              Employee Demographics
            </h2>
            <div className="space-y-4 text-sm">
              <DemoField label="ID" value={employee.accountNo} />
              <DemoField label="Phone" value={employee.phone} />
              <DemoField
                label="DOB"
                value={formatDateOfBirth(employee.dateOfBirth)}
              />
              <DemoField label="Gender" value={employee.gender} />
              <DemoField label="Address" value={employee.address} />
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
                      {formatDateMMDDYY(visitRow.date) || "—"}
                    </td>
                    <td className="px-5 py-3.5 text-ink">{visitRow.label}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="min-h-[20rem] w-full min-w-0 self-stretch rounded-2xl bg-foreground-900 p-4 shadow-sm sm:min-h-[24rem] sm:p-5 xl:min-h-full">
          {document.url ? (
            <div className="w-full">
              <PdfThumbnail
                url={document.url}
                title={document.title || document.documentType || "Document"}
                onOpen={() => setPreviewDocument({ ...document })}
              />
              <div className="mt-3 space-y-1 text-center">
                <DocumentNameText
                  name={docName}
                  className="text-sm font-semibold text-white sm:text-base"
                />
                {dateLabel ? (
                  <p className="text-sm font-semibold text-white/90">{dateLabel}</p>
                ) : null}
                <SharedAtStamp
                  value={livePayload?.sharedAt || session?.sharedAt}
                />
              </div>
              {document.provider ? (
                <p className="mt-2 text-center text-[11px] leading-relaxed text-white/55">
                  {document.provider}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex h-full min-h-[16rem] items-center justify-center rounded-xl bg-white/5 text-sm text-white/70">
              Document preview is not available.
            </div>
          )}
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
