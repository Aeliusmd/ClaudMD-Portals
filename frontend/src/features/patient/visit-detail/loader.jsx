"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PatientVisitDetailView } from "@/features/patient/visit-detail/view";
import { fetchPatientVisitDetail } from "@/lib/api/patient";
import { getAccessToken } from "@/lib/auth-session";
import { patientPaths } from "@/lib/portal-paths";

export function PatientVisitDetailLoader({ checkInId }) {
  const router = useRouter();
  const [visit, setVisit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = getAccessToken();
      if (!token) {
        router.replace(patientPaths.login);
        return;
      }

      if (!checkInId || !/^\d+$/.test(String(checkInId))) {
        setError("Visit not found.");
        setVisit(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const data = await fetchPatientVisitDetail(token, checkInId);
        if (!cancelled) {
          setVisit(data);
          setError(null);
        }
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 401) {
          router.replace(patientPaths.login);
          return;
        }
        setError(err?.message || "Unable to load visit details.");
        setVisit(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [checkInId, router]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/70 bg-white px-5 py-10 text-sm text-muted">
        Loading visit details…
      </div>
    );
  }

  if (error || !visit) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => router.push(patientPaths.dashboard)}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-cream"
        >
          Back to dashboard
        </button>
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error || "Visit not found."}
        </p>
      </div>
    );
  }

  return (
    <PatientVisitDetailView
      visit={visit}
      patient={visit.patient}
      showEmployer={visit.showEmployer}
      showInsurance={visit.showInsurance}
      showWorkStatus={visit.showWorkStatus}
      backHref={patientPaths.dashboard}
    />
  );
}
