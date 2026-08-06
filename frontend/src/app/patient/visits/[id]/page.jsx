import { notFound } from "next/navigation";
import { PatientVisitDetailView } from "@/features/patient/visit-detail/view";
import { findVisit, visits } from "@/data/visits";

/** Categories that are not employer-related, so the demographics card drops that block. */
const categoriesWithoutEmployer = new Set(["Urgent Care", "Personal Injury"]);

/** Physicals are not billed through insurance, so that block is dropped as well. */
const categoriesWithoutInsurance = new Set(["Physical"]);

/** Work status only applies to injury-related care. */
const categoriesWithoutWorkStatus = new Set([
  "Urgent Care",
  "Personal Injury",
  "Physical",
]);

export function generateStaticParams() {
  return visits.map((visit) => ({ id: visit.id }));
}

export default async function Page({ params }) {
  const { id } = await params;
  const visit = findVisit(decodeURIComponent(id));

  if (!visit) notFound();

  return (
    <PatientVisitDetailView
      visit={visit}
      showEmployer={!categoriesWithoutEmployer.has(visit.category)}
      showInsurance={!categoriesWithoutInsurance.has(visit.category)}
      showWorkStatus={!categoriesWithoutWorkStatus.has(visit.category)}
    />
  );
}
