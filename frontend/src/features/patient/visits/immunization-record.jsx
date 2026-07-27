import {
  DocumentFooter,
  DocumentMetaBox,
  DocumentSection,
} from "@/features/patient/visits/document-sections";

export function ImmunizationRecord({ record }) {
  return (
    <div>
      <h2 className="font-sans text-xl font-bold tracking-wide text-ink uppercase">
        {record.title}
      </h2>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <p>Document ID: {record.documentId}</p>
        <p>Date: {record.date}</p>
      </div>

      <DocumentMetaBox
        fields={[
          { label: "Provider", value: record.provider },
          { label: "Location", value: record.location },
          { label: "Patient", value: record.patient },
          { label: "DOB", value: record.dateOfBirth },
        ]}
      />

      <DocumentSection title="Vaccines Administered This Visit">
        <p className="font-semibold">{record.vaccinesAdministered.name}</p>
        {record.vaccinesAdministered.details.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </DocumentSection>

      <DocumentSection title="Complete Immunization History">
        {record.immunizationHistory.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </DocumentSection>

      <DocumentSection title="Upcoming Vaccinations">
        {record.upcomingVaccinations.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </DocumentSection>

      <DocumentSection title="Notes">
        <p>{record.notes}</p>
      </DocumentSection>

      <DocumentFooter
        signedBy={record.signedBy}
        signedDate={record.signedDate}
        confidentiality={record.confidentiality}
      />
    </div>
  );
}
