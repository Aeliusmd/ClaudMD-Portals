import { notFound } from "next/navigation";
import { InsurancePatientDetailView } from "@/features/insurance/patient-detail/view";
import { findInsurancePatient, insurancePatients } from "@/data/insurance";

const backHrefByCoverage = {
  "Workers Comp": "/insurance/dashboard?tab=workersComp",
  "Private Insurance": "/insurance/dashboard?tab=privateInsurance",
};

export function generateStaticParams() {
  return insurancePatients.map((patient) => ({ id: patient.id }));
}

export default async function Page({ params }) {
  const { id } = await params;
  const patient = findInsurancePatient(id);

  if (!patient) notFound();

  return (
    <InsurancePatientDetailView
      patient={patient}
      backHref={backHrefByCoverage[patient.coverage] || "/insurance/dashboard"}
    />
  );
}
