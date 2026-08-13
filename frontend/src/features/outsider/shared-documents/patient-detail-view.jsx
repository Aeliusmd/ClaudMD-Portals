"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, UserRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DocumentPreviewModal } from "@/components/ui/document-preview-modal";
import {
  DocumentThumbGrid,
  DocumentThumbTile,
} from "@/components/ui/document-thumb-tile";
import { EmptyState } from "@/components/ui/empty-state";
import {
  fetchOutsiderSharedDocuments,
  markOutsiderSharedDocumentViewed,
} from "@/lib/api/outsider";
import { getAccessToken } from "@/lib/auth-session";
import { groupOutsiderSharedDocuments } from "@/lib/outsider-shared-docs";
import { outsiderPaths } from "@/lib/portal-paths";
import { saveSecureShareSession } from "@/lib/secure-share-session";
import { cn } from "@/lib/utils";

function DocumentGallery({ documents, onPreview, unread = false }) {
  if (!documents.length) {
    return (
      <div className="flex h-full min-h-[16rem] items-center justify-center rounded-xl bg-white/5 text-sm text-white/70">
        {unread ? "No unread documents." : "No previously shared documents."}
      </div>
    );
  }

  return (
    <DocumentThumbGrid>
      {documents.map((doc) => (
        <DocumentThumbTile
          key={`${doc.sharedId}-${doc.id}`}
          doc={doc}
          onPreview={onPreview}
          className={
            unread && !doc.isViewed
              ? "rounded-2xl ring-2 ring-primary-500 ring-offset-2 ring-offset-foreground-900"
              : undefined
          }
        />
      ))}
    </DocumentThumbGrid>
  );
}

export function OutsiderPatientSharedDocumentsView({ patientKey }) {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = getAccessToken();
      if (!token) {
        router.replace(outsiderPaths.login);
        return;
      }
      setLoading(true);
      try {
        const data = await fetchOutsiderSharedDocuments(token);
        if (cancelled) return;
        setItems(data.items || []);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 401 || err?.status === 403) {
          router.replace(outsiderPaths.login);
          return;
        }
        setError(err?.message || "Unable to load shared documents.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const patient = useMemo(() => {
    const groups = groupOutsiderSharedDocuments(items);
    return groups.find((row) => row.patientKey === String(patientKey)) || null;
  }, [items, patientKey]);

  function markItemsViewed(sharedId, documentId) {
    const wantedShare = String(sharedId || "").toLowerCase();
    const wantedDoc = documentId != null ? String(documentId) : "";
    setItems((prev) =>
      prev.map((item) => {
        const sameShare =
          wantedShare && String(item.sharedId || "").toLowerCase() === wantedShare;
        const sameDoc =
          wantedDoc && String(item.documentId ?? "") === wantedDoc;
        if (!sameShare && !sameDoc) return item;
        return { ...item, isViewed: true };
      })
    );
  }

  async function handlePreview(file) {
    if (file?.sharedId) {
      saveSecureShareSession({
        sharedId: file.sharedId,
        recipientRole: "outsider",
      });
    }
    setPreviewDocument(file);
    const token = getAccessToken();
    if (!token || !file?.sharedId) return;
    try {
      await markOutsiderSharedDocumentViewed(token, file.sharedId);
      markItemsViewed(file.sharedId, file.documentId ?? file.id);
    } catch {
      // Preview still opens even if the viewed flag could not be saved.
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-48 items-center justify-center text-sm text-muted">
        Loading shared documents…
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

  if (!patient) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => router.push(outsiderPaths.sharedDocuments)}
          className="cursor-pointer text-sm font-semibold text-primary-500 hover:text-primary-600"
        >
          ← Back to shared documents
        </button>
        <EmptyState
          title="Patient not found"
          description="No shared documents were found for this patient."
        />
      </div>
    );
  }

  const unreadDocuments = patient.unreadDocuments || [];
  const viewedDocuments = patient.viewedDocuments || [];

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => router.push(outsiderPaths.sharedDocuments)}
        className="cursor-pointer text-sm font-semibold text-primary-500 hover:text-primary-600"
      >
        ← Back to shared documents
      </button>

      <Card className="p-5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600">
            <UserRound className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-bold text-foreground-900">
              {patient.name}
            </p>
            <p className="mt-0.5 text-sm text-foreground-500">Patient</p>
          </div>
        </div>
      </Card>

      <div className="min-h-[18rem] w-full rounded-2xl bg-foreground-900 p-4 shadow-sm sm:min-h-[22rem] sm:p-5">
        <DocumentGallery
          documents={unreadDocuments}
          onPreview={handlePreview}
          unread
        />
      </div>

      {viewedDocuments.length > 0 ? (
        <Card className="overflow-hidden p-0">
          <button
            type="button"
            onClick={() => setHistoryOpen((open) => !open)}
            className="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-4 text-left"
          >
            <div>
              <p className="text-sm font-semibold text-foreground-900">
                Previously shared
              </p>
              <p className="mt-0.5 text-xs text-foreground-500">
                {viewedDocuments.length} viewed document
                {viewedDocuments.length === 1 ? "" : "s"}
              </p>
            </div>
            <ChevronDown
              className={cn(
                "h-5 w-5 shrink-0 text-foreground-500 transition-transform",
                historyOpen ? "rotate-180" : ""
              )}
            />
          </button>
          {historyOpen ? (
            <div className="border-t border-background-200 bg-foreground-900 p-4 sm:p-5">
              <DocumentGallery
                documents={viewedDocuments}
                onPreview={handlePreview}
              />
            </div>
          ) : null}
        </Card>
      ) : null}

      {previewDocument ? (
        <DocumentPreviewModal
          file={previewDocument}
          onClose={() => setPreviewDocument(null)}
        />
      ) : null}
    </div>
  );
}
