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
import { EmptyState } from "@/components/ui/empty-state";
import { fetchOutsiderSharedDocuments } from "@/lib/api/outsider";
import { getAccessToken } from "@/lib/auth-session";
import { groupOutsiderSharedDocuments } from "@/lib/outsider-shared-docs";
import { outsiderPaths } from "@/lib/portal-paths";
import { saveSecureShareSession } from "@/lib/secure-share-session";

export function OutsiderPatientSharedDocumentsView({ patientKey }) {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [previewDocument, setPreviewDocument] = useState(null);

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

  function handlePreview(file) {
    if (file?.sharedId) {
      saveSecureShareSession({
        sharedId: file.sharedId,
        recipientRole: "outsider",
      });
    }
    setPreviewDocument(file);
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
        {patient.documents.length === 0 ? (
          <div className="flex h-full min-h-[16rem] items-center justify-center rounded-xl bg-white/5 text-sm text-white/70">
            No documents for this patient.
          </div>
        ) : (
          <DocumentThumbGrid>
            {patient.documents.map((doc) => (
              <DocumentThumbTile
                key={`${doc.sharedId}-${doc.id}`}
                doc={doc}
                onPreview={handlePreview}
              />
            ))}
          </DocumentThumbGrid>
        )}
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
