"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { InsurancePatientDetailView } from "@/features/insurance/patient-detail/view";
import { fetchInsurancePatientDetail } from "@/lib/api/insurance";
import { getAccessToken } from "@/lib/auth-session";
import { dashboardHrefFromReturn } from "@/lib/dashboard-return-state";
import { insurancePaths } from "@/lib/portal-paths";

const backHrefByCoverage = {
  "Workers Comp": `${insurancePaths.dashboard}?tab=workersComp`,
  "Private Insurance": `${insurancePaths.dashboard}?tab=privateInsurance`,
};

function normalizeCoverageParam(value) {
  const key = String(value || "").trim().toLowerCase();
  if (["private", "private_insurance", "privateinsurance"].includes(key)) {
    return "private";
  }
  if (["workers_comp", "workerscomp", "wc"].includes(key)) {
    return "workers_comp";
  }
  return null;
}

export function InsurancePatientDetailLoader({ patientId }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const coverage = normalizeCoverageParam(searchParams.get("coverage"));
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = getAccessToken();
      if (!token) {
        router.replace(insurancePaths.login);
        return;
      }

      if (!patientId || !/^\d+$/.test(String(patientId))) {
        setError("Patient not found.");
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const data = await fetchInsurancePatientDetail(token, patientId, {
          coverage: coverage || undefined,
        });
        if (!cancelled) {
          setPatient(data);
          setError(null);
        }
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 401) {
          router.replace(insurancePaths.login);
          return;
        }
        setError(err?.message || "Unable to load patient details.");
        setPatient(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [coverage, patientId, router]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/70 bg-white px-5 py-10 text-sm text-muted">
        Loading patient details…
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() =>
            router.push(
              dashboardHrefFromReturn(insurancePaths.dashboard, searchParams)
            )
          }
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-cream"
        >
          Back to dashboard
        </button>
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error || "Patient not found."}
        </p>
      </div>
    );
  }

  const restoredBack = dashboardHrefFromReturn(
    insurancePaths.dashboard,
    searchParams
  );
  const fallbackBack =
    backHrefByCoverage[patient.coverage] || insurancePaths.dashboard;

  return (
    <InsurancePatientDetailView
      patient={patient}
      backHref={
        restoredBack !== insurancePaths.dashboard ? restoredBack : fallbackBack
      }
    />
  );
}
