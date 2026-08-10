import { PatientVisitDetailLoader } from "@/features/patient/visit-detail/loader";

export default async function Page({ params }) {
  const { id } = await params;
  return (
    <PatientVisitDetailLoader checkInId={decodeURIComponent(id)} />
  );
}
