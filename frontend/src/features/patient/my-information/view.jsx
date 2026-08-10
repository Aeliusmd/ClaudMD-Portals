"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonBlock } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { fetchPatientMyInformation } from "@/lib/api/patient";
import { getAccessToken } from "@/lib/auth-session";
import { patientPaths } from "@/lib/portal-paths";
import { cn } from "@/lib/utils";

const tabs = [
  { id: "personal", label: "Personal" },
  { id: "insurance", label: "Insurance" },
  { id: "employer", label: "Employer" },
];

function displayValue(value) {
  const text = (value || "").trim();
  return text || "—";
}

function InfoItem({ label, value, className }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
        {label}
      </p>
      <p className="mt-1.5 text-sm font-medium text-ink sm:text-[0.95rem]">
        {displayValue(value)}
      </p>
    </div>
  );
}

function InformationSkeleton() {
  return (
    <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <SkeletonBlock
          key={index}
          className={cn("h-12", index >= 4 && "sm:col-span-2")}
        />
      ))}
    </div>
  );
}

export function PatientMyInformationView() {
  const router = useRouter();
  const [tab, setTab] = useState("personal");
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = getAccessToken();
      if (!token) {
        router.replace(patientPaths.login);
        return;
      }

      setLoading(true);
      try {
        const data = await fetchPatientMyInformation(token);
        if (!cancelled) {
          setInfo(data);
          setError("");
        }
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 401) {
          router.replace(patientPaths.login);
          return;
        }
        setError(err?.message || "Unable to load my information.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const insurance = info?.insurance || {};
  const employer = info?.employer || {};

  return (
    <div>
      <PageHeader title="My Information" className="mb-5" />
      <Tabs items={tabs} value={tab} onChange={setTab} className="mb-5" />

      {error ? (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800"
        >
          {error}
        </div>
      ) : null}

      <Card className="p-5 sm:p-6 md:p-7">
        {loading ? <InformationSkeleton /> : null}

        {!loading && tab === "personal" ? (
          <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
            <InfoItem label="Full Name" value={info?.fullName} />
            <InfoItem label="Date of Birth" value={info?.dateOfBirth} />
            <InfoItem label="Email" value={info?.email} />
            <InfoItem label="Phone" value={info?.phone} />
            <InfoItem
              className="sm:col-span-2"
              label="Address"
              value={info?.address}
            />
            <InfoItem
              className="sm:col-span-2"
              label="Emergency Contact"
              value={info?.emergencyContact}
            />
          </div>
        ) : null}

        {!loading && tab === "insurance" ? (
          <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
            <InfoItem label="Insurance Carrier" value={insurance.carrier} />
            <InfoItem label="Policy Number" value={insurance.policyNumber} />
            <InfoItem label="Group Number" value={insurance.groupNumber} />
            <InfoItem label="Plan Type" value={insurance.planType} />
            <InfoItem label="Effective Date" value={insurance.effectiveDate} />
          </div>
        ) : null}

        {!loading && tab === "employer" ? (
          <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
            <InfoItem label="Employer Name" value={employer.name} />
            <InfoItem label="Department" value={employer.department} />
          </div>
        ) : null}
      </Card>
    </div>
  );
}
