import { fetchJson } from "@/lib/api/http";
import { outsiderSharedDocumentFileUrl } from "@/lib/documents";
import { formatDateMMDDYY, formatDateMMDDYYYY } from "@/lib/dates";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

async function outsiderFetch(path, accessToken, fallbackMessage) {
  return fetchJson(
    `${API_BASE_URL}${path}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
    fallbackMessage
  );
}

export async function fetchOutsiderSharedDocumentBySharedId(
  accessToken,
  sharedId
) {
  const data = await outsiderFetch(
    `/api/outsider/shared-documents/by-shared-id/${encodeURIComponent(sharedId)}`,
    accessToken,
    "Unable to load shared document."
  );

  const fileUrl = outsiderSharedDocumentFileUrl(data.shared_id);
  const employee = data.employee || {};

  return {
    sharedId: data.shared_id,
    documentId: data.document_id,
    documentType: data.document_type || data.report_title || "Shared document",
    reportTitle: data.report_title || data.document_type || "Shared document",
    fileName: data.file_name || null,
    visitDate: formatDateMMDDYY(data.visit_date) || data.visit_date || null,
    visitLabel: data.visit_label || "Visit",
    employee: {
      patientId: employee.patient_id ?? null,
      name: employee.name || "Patient",
      accountNo: employee.account_no || null,
      dateOfBirth:
        formatDateMMDDYYYY(employee.date_of_birth) ||
        employee.date_of_birth ||
        null,
      gender: employee.gender || null,
      phone: employee.phone || null,
      address: employee.address || null,
    },
    document: {
      id: String(data.document_id),
      documentId: String(data.document_id),
      title: data.report_title || data.document_type || data.file_name,
      documentType: data.document_type || data.report_title,
      previewLabel: "Report",
      previewBadge:
        String(data.document_type || data.report_title || "")
          .toLowerCase()
          .includes("doctor") &&
        String(data.document_type || data.report_title || "")
          .toLowerCase()
          .includes("first")
          ? "DFR"
          : "DOC",
      visitDate: formatDateMMDDYY(data.visit_date) || data.visit_date || null,
      reportDate: formatDateMMDDYY(data.visit_date) || data.visit_date || null,
      provider: null,
      url: fileUrl,
    },
  };
}
