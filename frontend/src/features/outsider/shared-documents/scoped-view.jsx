"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DocumentPreviewModal } from "@/components/ui/document-preview-modal";
import {
  DocumentThumbGrid,
  DocumentThumbTile,
} from "@/components/ui/document-thumb-tile";
import { fetchOutsiderSharedDocumentBySharedId } from "@/lib/api/outsider";
import { getAccessToken } from "@/lib/auth-session";
import { outsiderPaths } from "@/lib/portal-paths";
import {
  clearSecureShareSession,
  getSecureShareSession,
} from "@/lib/secure-share-session";

/**
 * Single-document view after share-link login (sharedid).
 * No patient table / summary — only the document from that URL.
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
      router.replace(outsiderPaths.sharedDocuments);
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

  const tile = useMemo(() => {
    if (!livePayload?.document?.url) return null;
    return {
      id: String(livePayload.documentId),
      documentId: String(livePayload.documentId),
      sharedId: livePayload.sharedId,
      title:
        livePayload.document?.title ||
        livePayload.reportTitle ||
        livePayload.documentType,
      documentType: livePayload.documentType,
      reportTitle: livePayload.reportTitle,
      visitDate: livePayload.visitDate,
      publishedAt: livePayload.sharedAt || livePayload.visitDate || null,
      url: livePayload.document.url,
      previousVersions: [],
    };
  }, [livePayload]);

  const patientName = livePayload?.employee?.name || "Patient";

  if (!ready) {
    return (
      <div className="flex min-h-48 items-center justify-center text-sm text-muted">
        Loading shared document…
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

  if (!tile) {
    return (
      <div className="flex min-h-48 items-center justify-center text-sm text-muted">
        Shared document is not available.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600">
            <UserRound className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold text-foreground-900">{patientName}</p>
            <p className="mt-0.5 text-sm text-foreground-500">Patient</p>
          </div>
        </div>
      </Card>

      <div className="min-h-[18rem] w-full rounded-2xl bg-foreground-900 p-4 shadow-sm sm:min-h-[22rem] sm:p-5">
        <DocumentThumbGrid showVersionHint={false}>
          <DocumentThumbTile
            doc={tile}
            onPreview={setPreviewDocument}
          />
        </DocumentThumbGrid>
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
