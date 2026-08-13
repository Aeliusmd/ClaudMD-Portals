"use client";

import { useParams } from "next/navigation";
import { OutsiderPatientSharedDocumentsView } from "@/features/outsider/shared-documents/patient-detail-view";

export default function OutsiderPatientSharedDocumentsPage() {
  const params = useParams();
  return (
    <OutsiderPatientSharedDocumentsView patientKey={params?.patientId} />
  );
}
