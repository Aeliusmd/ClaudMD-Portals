import { Suspense } from "react";
import { InsurancePatientDetailLoader } from "@/features/insurance/patient-detail/loader";

export default async function Page({ params }) {
  const { id } = await params;
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-border/70 bg-white px-5 py-10 text-sm text-muted">
          Loading patient details…
        </div>
      }
    >
      <InsurancePatientDetailLoader patientId={id} />
    </Suspense>
  );
}
