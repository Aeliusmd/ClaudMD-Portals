import { notFound } from "next/navigation";
import { InsurancePatientDetailView } from "@/features/insurance/patient-detail/view";
import { findInsurancePatient, insurancePatients } from "@/data/insurance";
import { insurancePaths } from "@/lib/portal-paths";

const backHrefByCoverage = {
  "Workers Comp": `${insurancePaths.dashboard}?tab=workersComp`,
  "Private Insurance": `${insurancePaths.dashboard}?tab=privateInsurance`,
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
      backHref={backHrefByCoverage[patient.coverage] || insurancePaths.dashboard}
    />
  );
}
