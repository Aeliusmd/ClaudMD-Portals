import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { immunizationRecordDoc } from "@/data/visit-documents";
import { ImmunizationRecord } from "@/features/patient/visits/immunization-record";

export function VisitDocumentPanel({ onBack }) {
  return (
    <Card className="p-5">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-primary transition hover:text-primary-dark"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to details
      </button>

      <ImmunizationRecord record={immunizationRecordDoc} />
    </Card>
  );
}
