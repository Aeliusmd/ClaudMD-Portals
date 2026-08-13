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

function mapOutsiderSharedDetail(data) {
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
    checkInId: data.check_in_id ?? data.checkInId ?? null,
    reportId: data.report_id ?? data.reportId ?? null,
    publishedAt: data.published_at || data.publishedAt || null,
    sharedAt: data.shared_at || data.sharedAt || null,
    isViewed: Boolean(data.is_viewed ?? data.isViewed),
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
      publishedAt: data.published_at || data.publishedAt || null,
      provider: null,
      url: fileUrl,
    },
  };
}

export async function fetchOutsiderProfile(accessToken) {
  const data = await outsiderFetch(
    "/api/outsider/me",
    accessToken,
    "Unable to load profile."
  );
  const firstName = data.first_name || "";
  const lastName = data.last_name || "";
  return {
    fullName:
      [firstName, lastName].filter(Boolean).join(" ") || data.full_name || "",
    firstName,
    lastName,
    title: data.title || "",
    email: data.email || "",
    loginId: data.login_id || "",
    phone: data.phone || "",
    userId: data.user_id,
    typeId: data.type_id,
    typeLabel: data.type_label,
  };
}

export async function fetchOutsiderSharedDocuments(accessToken) {
  const data = await outsiderFetch(
    "/api/outsider/shared-documents",
    accessToken,
    "Unable to load shared documents."
  );
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    items: items.map(mapOutsiderSharedDetail),
    total: data.total ?? items.length,
  };
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
  return mapOutsiderSharedDetail(data);
}

export async function markOutsiderSharedDocumentViewed(accessToken, sharedId) {
  if (!sharedId) return null;
  return fetchJson(
    `${API_BASE_URL}/api/outsider/shared-documents/by-shared-id/${encodeURIComponent(
      sharedId
    )}/viewed`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
    "Unable to mark document as viewed."
  );
}
