"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { currentPatient } from "@/data/patient";
import { cn } from "@/lib/utils";

const tabs = [
  { id: "personal", label: "Personal" },
  { id: "insurance", label: "Insurance" },
  { id: "employer", label: "Employer" },
];

function InfoItem({ label, value, className }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
        {label}
      </p>
      <p className="mt-1.5 text-sm font-medium text-ink sm:text-[0.95rem]">
        {value}
      </p>
    </div>
  );
}

export function PatientMyInformationView() {
  const [tab, setTab] = useState("personal");
  const { insurance, employer } = currentPatient;

  return (
    <div>
      <PageHeader title="My Information" className="mb-5" />
      <Tabs items={tabs} value={tab} onChange={setTab} className="mb-5" />

      <Card className="p-5 sm:p-6 md:p-7">
        {tab === "personal" ? (
          <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
            <InfoItem label="Full Name" value={currentPatient.fullName} />
            <InfoItem label="Date of Birth" value={currentPatient.dateOfBirth} />
            <InfoItem label="Email" value={currentPatient.email} />
            <InfoItem label="Phone" value={currentPatient.phone} />
            <InfoItem
              className="sm:col-span-2"
              label="Address"
              value={currentPatient.address}
            />
            <InfoItem
              className="sm:col-span-2"
              label="Emergency Contact"
              value={currentPatient.emergencyContact}
            />
          </div>
        ) : null}

        {tab === "insurance" ? (
          <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
            <InfoItem label="Insurance Carrier" value={insurance.carrier} />
            <InfoItem label="Policy Number" value={insurance.policyNumber} />
            <InfoItem label="Group Number" value={insurance.groupNumber} />
            <InfoItem label="Plan Type" value={insurance.planType} />
            <InfoItem label="Effective Date" value={insurance.effectiveDate} />
          </div>
        ) : null}

        {tab === "employer" ? (
          <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
            <InfoItem label="Employer Name" value={employer.name} />
            <InfoItem label="Department" value={employer.department} />
          </div>
        ) : null}
      </Card>
    </div>
  );
}
