"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { InfoField } from "@/components/ui/info-field";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { currentPatient } from "@/data/patient";

const tabs = [
  { id: "personal", label: "Personal" },
  { id: "insurance", label: "Insurance" },
  { id: "employer", label: "Employer" },
];

export function PatientMyInformationView() {
  const [tab, setTab] = useState("personal");
  const { insurance, employer } = currentPatient;

  return (
    <div>
      <PageHeader title="My Information" />
      <Tabs items={tabs} value={tab} onChange={setTab} className="mb-5" />

      <Card className="px-5">
        {tab === "personal" ? (
          <>
            <InfoField label="Full Name" value={currentPatient.fullName} />
            <InfoField label="Date of Birth" value={currentPatient.dateOfBirth} />
            <InfoField label="Email" value={currentPatient.email} />
            <InfoField label="Phone" value={currentPatient.phone} />
            <InfoField label="Address" value={currentPatient.address} />
            <InfoField
              label="Emergency Contact"
              value={currentPatient.emergencyContact}
            />
          </>
        ) : null}

        {tab === "insurance" ? (
          <>
            <InfoField label="Insurance Carrier" value={insurance.carrier} />
            <InfoField label="Policy Number" value={insurance.policyNumber} />
            <InfoField label="Group Number" value={insurance.groupNumber} />
            <InfoField label="Plan Type" value={insurance.planType} />
            <InfoField label="Effective Date" value={insurance.effectiveDate} />
          </>
        ) : null}

        {tab === "employer" ? (
          <>
            <InfoField label="Employer Name" value={employer.name} />
            <InfoField label="Department" value={employer.department} />
          </>
        ) : null}
      </Card>
    </div>
  );
}
