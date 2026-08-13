"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { fetchOutsiderSharedDocuments } from "@/lib/api/outsider";
import { getAccessToken } from "@/lib/auth-session";
import { formatDateTimeCompactMMDDYY } from "@/lib/dates";
import { groupOutsiderSharedDocuments } from "@/lib/outsider-shared-docs";
import { outsiderPaths } from "@/lib/portal-paths";
import { cn } from "@/lib/utils";

export function OutsiderSharedDocumentsView() {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  const patients = useMemo(
    () => groupOutsiderSharedDocuments(items),
    [items]
  );

  function openPatient(patient) {
    router.push(outsiderPaths.sharedDocumentsPatient(patient.patientKey));
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

  if (!patients.length) {
    return (
      <EmptyState
        title="No shared documents"
        description="When a clinic shares a report with you, it will appear here."
      />
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
        Shared Documents
      </h1>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-background-200 bg-background-50 text-[11px] font-bold tracking-[0.08em] text-foreground-500 uppercase">
              <tr>
                <th className="px-5 py-3 font-bold">Patient</th>
                <th className="px-5 py-3 font-bold">Last shared</th>
                <th className="px-5 py-3 font-bold">Documents</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-background-200">
              {patients.map((patient) => (
                <tr
                  key={patient.patientKey}
                  onClick={() => openPatient(patient)}
                  className={cn(
                    "cursor-pointer transition",
                    patient.hasUnread
                      ? "border-l-4 border-l-primary-500 bg-primary-50"
                      : "border-l-4 border-l-transparent bg-white hover:bg-background-50"
                  )}
                >
                  <td
                    className={cn(
                      "px-5 py-3.5 text-foreground-900",
                      patient.hasUnread ? "font-bold" : "font-medium"
                    )}
                  >
                    {patient.name}
                    <span className="mt-0.5 block text-xs font-normal text-foreground-500">
                      Patient
                    </span>
                  </td>
                  <td className="px-5 py-3.5 tabular-nums text-foreground-900">
                    {formatDateTimeCompactMMDDYY(patient.lastSharedAt) || "—"}
                  </td>
                  <td className="px-5 py-3.5 tabular-nums text-foreground-900">
                    {patient.documentCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
