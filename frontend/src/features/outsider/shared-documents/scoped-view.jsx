"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, LogOut } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DocumentNameText } from "@/components/ui/document-name-text";
import { DocumentPreviewModal } from "@/components/ui/document-preview-modal";
import { PdfThumbnail } from "@/components/ui/pdf-thumbnail";
import { fetchOutsiderSharedDocumentBySharedId } from "@/lib/api/outsider";
import { clearAuthSession, getAccessToken } from "@/lib/auth-session";
import { outsiderPaths } from "@/lib/portal-paths";
import {
  clearSecureShareSession,
  getSecureShareSession,
} from "@/lib/secure-share-session";
import {
  documentDisplayName,
  shortDocumentBadge,
} from "@/lib/document-labels";
import { formatDateMMDDYY } from "@/lib/dates";

/**
 * Document-only view for external recipients (family/other) after secure-link login.
 */
export function OutsiderScopedSharedDocumentsView() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [livePayload, setLivePayload] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);

  useEffect(() => {
    const active = getSecureShareSession();
    if (!active?.sharedId) {
      router.replace(outsiderPaths.login);
      return undefined;
    }

    let cancelled = false;

    async function load() {
      const token = getAccessToken();
      if (!token) {
        clearSecureShareSession();
        router.replace(outsiderPaths.login);
        return;
      }
      try {
        const detail = await fetchOutsiderSharedDocumentBySharedId(
          token,
          active.sharedId
        );
        if (cancelled) return;
        setLivePayload(detail);
        setError(null);
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || "Unable to load shared document.");
        setReady(true);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const patientName = livePayload?.employee?.name || "Patient";
  const document = livePayload?.document || null;
  const visitLabel = livePayload?.visitLabel || "Visit";
  const visitDate = livePayload?.visitDate || null;

  const badge = useMemo(
    () => (document ? shortDocumentBadge(document) : "DOC"),
    [document]
  );
  const docName = useMemo(
    () => (document ? documentDisplayName(document) : "Document"),
    [document]
  );
  const dateLabel = formatDateMMDDYY(visitDate);

  function handleSignOut() {
    clearSecureShareSession();
    clearAuthSession();
    router.replace(outsiderPaths.login);
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted">
        Loading shared report…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-lg rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted">
        Shared document is not available.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream/30">
      <header className="border-b border-border/70 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">Shared document</p>
              <p className="truncate text-xs text-muted">
                {patientName}
                {dateLabel ? ` · ${dateLabel}` : ""}
                {visitLabel ? ` · ${visitLabel}` : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border/80 bg-white px-3 py-2 text-sm font-medium text-ink transition hover:bg-cream/60"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Card className="overflow-hidden p-0">
          <div className="bg-foreground-900 p-4 sm:p-6">
            {document.url ? (
              <div className="w-full">
                <PdfThumbnail
                  url={document.url}
                  badge={badge}
                  title={document.title || document.documentType || "Document"}
                  onOpen={() =>
                    setPreviewDocument({
                      ...document,
                      previewBadge: badge,
                    })
                  }
                />
                <div className="mt-4 space-y-1 text-center">
                  {dateLabel ? (
                    <p className="text-sm font-semibold text-white/90">
                      {dateLabel}
                    </p>
                  ) : null}
                  <DocumentNameText
                    name={docName}
                    className="text-base font-semibold text-white"
                  />
                </div>
              </div>
            ) : (
              <div className="flex min-h-[16rem] items-center justify-center rounded-xl bg-white/5 text-sm text-white/70">
                Document preview is not available.
              </div>
            )}
          </div>
        </Card>
      </main>

      {previewDocument ? (
        <DocumentPreviewModal
          file={previewDocument}
          onClose={() => setPreviewDocument(null)}
        />
      ) : null}
    </div>
  );
}
