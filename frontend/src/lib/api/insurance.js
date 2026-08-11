import { fetchJson } from "@/lib/api/http";
import {
  insuranceSharedDocumentFileUrl,
  insuranceVisitDocumentFileUrl,
} from "@/lib/documents";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

async function insuranceFetch(path, accessToken, fallbackMessage, options = {}) {
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  return fetchJson(
    `${API_BASE_URL}${path}`,
    {
      method: options.method || "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    },
    fallbackMessage
  );
}

function mapInsuranceProfile(data) {
  let firstName = data.first_name || "";
  let lastName = data.last_name || "";
  if (!firstName && !lastName && data.full_name) {
    const parts = String(data.full_name).trim().split(/\s+/).filter(Boolean);
    firstName = parts[0] || "";
    lastName = parts.slice(1).join(" ");
  }

  return {
    fullName:
      data.full_name ||
      [firstName, lastName].filter(Boolean).join(" ") ||
      "",
    firstName,
    lastName,
    title: data.title || "",
    role: data.type_label || null,
    jobTitle: data.title || null,
    email: data.email || "",
    phone: data.phone || "",
    organization: data.organization || "",
    address: data.address || "",
    insuranceId: data.insurance_id,
    insuranceContactId: data.insurance_contact_id,
    userId: data.user_id,
    loginId: data.login_id,
    typeId: data.type_id,
    typeLabel: data.type_label,
  };
}

export async function fetchInsuranceProfile(accessToken) {
  const data = await insuranceFetch(
    "/api/insurance/me",
    accessToken,
    "Unable to load insurance profile."
  );
  return mapInsuranceProfile(data);
}

export async function updateInsuranceProfile(accessToken, payload) {
  const data = await insuranceFetch(
    "/api/insurance/me",
    accessToken,
    "Unable to update insurance profile.",
    {
      method: "PATCH",
      body: {
        first_name: payload.firstName,
        last_name: payload.lastName ?? "",
        title: payload.title || null,
        email: payload.email,
        phone: payload.phone || null,
      },
    }
  );
  return mapInsuranceProfile(data);
}

export async function fetchInsuranceOrganizationUsers(accessToken) {
  const data = await insuranceFetch(
    "/api/insurance/organization-users",
    accessToken,
    "Unable to load organization users."
  );

  return {
    insuranceId: data.insurance_id,
    organization: data.organization || "",
    total: data.total ?? 0,
    canManageAccess: Boolean(data.can_manage_access),
    items: (data.items || []).map((row) => ({
      id: row.id,
      contactId: row.contact_id,
      userId: row.user_id,
      fullName: row.full_name,
      email: row.email || "",
      title: row.title || "",
      loginId: row.login_id || "",
      typeId: row.type_id,
      typeLabel: row.type_label,
      role: row.role || row.type_label || "—",
      accessLevel: row.access_level,
      active: Boolean(row.active),
      contactType: row.contact_type || "",
    })),
  };
}

export async function fetchInsuranceNotifications(
  accessToken,
  { page = 1, pageSize = 10 } = {}
) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  const data = await insuranceFetch(
    `/api/insurance/notifications?${params.toString()}`,
    accessToken,
    "Unable to load notifications."
  );

  return {
    items: (data.items || []).map((row) => ({
      id: row.id,
      message: row.message,
      timeAgo: row.time_ago || "",
      unread: Boolean(row.unread),
      href: row.href || null,
      source: row.source,
      sourceId: row.source_id,
      createdAt: row.created_at,
    })),
    total: data.total ?? 0,
    unreadCount: data.unread_count ?? 0,
    page: data.page ?? page,
    pageSize: data.page_size ?? pageSize,
    totalPages: data.total_pages ?? 1,
    days: data.days ?? 30,
    insuranceId: data.insurance_id,
  };
}

export async function markInsuranceNotificationsRead(accessToken) {
  const data = await insuranceFetch(
    "/api/insurance/notifications/mark-read",
    accessToken,
    "Unable to mark notifications as read.",
    { method: "POST" }
  );

  return {
    updatedCount: data.updated_count ?? 0,
    insuranceId: data.insurance_id,
  };
}

export async function fetchInsuranceDashboardSummary(accessToken) {
  const data = await insuranceFetch(
    "/api/insurance/dashboard/summary",
    accessToken,
    "Unable to load insurance dashboard summary."
  );

  return {
    workersComp: data.workers_comp ?? data.workersComp ?? 0,
    privateInsurance: data.private_insurance ?? data.privateInsurance ?? 0,
    unreadReports: data.unread_reports ?? data.unreadReports ?? 0,
    days: data.days ?? 30,
    insuranceId: data.insurance_id ?? data.insuranceId ?? null,
  };
}

function mapInsurancePatientRow(row) {
  const incidentNumber = row.incident_number || "N/A";
  const coverage = row.coverage || "Workers Comp";
  let category = row.category || "—";
  // Workers Comp must display Injury (not Personal Injury).
  if (coverage === "Workers Comp" && category === "Personal Injury") {
    category = "Injury";
  }
  return {
    id: String(row.id ?? row.patient_id),
    patientId: row.patient_id,
    checkInId: row.check_in_id,
    coverage,
    patient: row.patient_name,
    employer: row.employer_name || "—",
    insurance: row.insurance_company || null,
    accountNo: row.account_no != null ? String(row.account_no) : null,
    incidentId: row.incident_id,
    incidentNumber,
    // Private Insurance table labels this column "Claim #".
    claimNumber: incidentNumber,
    category,
    lastVisit: row.last_visit || "—",
    lastVisitValue: row.last_visit_value,
    workStatus: row.work_status || "—",
    disabilityStatus: row.disability_status,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    phone: row.phone,
    email: row.email,
    address: row.address,
  };
}

export async function fetchInsurancePatientSearch(
  accessToken,
  {
    fromDate,
    toDate,
    page = 1,
    pageSize = 10,
    search,
    coverage = "workers_comp",
  } = {}
) {
  const params = new URLSearchParams();
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (search) params.set("search", search);
  if (coverage) params.set("coverage", coverage);
  const qs = params.toString();
  const path = `/api/insurance/patients/search${qs ? `?${qs}` : ""}`;

  const data = await insuranceFetch(
    path,
    accessToken,
    "Unable to load insurance patients."
  );

  return {
    items: (data.items || []).map(mapInsurancePatientRow),
    total: data.total ?? 0,
    page: data.page ?? page,
    pageSize: data.page_size ?? pageSize,
    totalPages: data.total_pages ?? 1,
    fromDate: data.from_date,
    toDate: data.to_date,
    insuranceId: data.insurance_id,
    coverage: data.coverage,
  };
}

export async function fetchInsurancePatientDetail(
  accessToken,
  patientId,
  { fromDate, toDate, coverage } = {}
) {
  const params = new URLSearchParams();
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);
  if (coverage) params.set("coverage", coverage);
  const qs = params.toString();
  const path = `/api/insurance/patients/${encodeURIComponent(patientId)}${
    qs ? `?${qs}` : ""
  }`;

  const data = await insuranceFetch(
    path,
    accessToken,
    "Unable to load patient details."
  );

  const incidentNumber = data.incident_number || null;

  return {
    id: String(data.patient_id),
    patientId: data.display_patient_id || `P-${data.patient_id}`,
    numericPatientId: data.patient_id,
    checkInId: data.check_in_id,
    coverage: data.coverage || "Workers Comp",
    patient: data.patient_name,
    accountNo: data.account_no != null ? String(data.account_no) : null,
    dateOfBirth: data.date_of_birth,
    gender: data.gender,
    phone: data.phone,
    email: data.email,
    addressLines: Array.isArray(data.address_lines) ? data.address_lines : [],
    employer: data.employer_name || null,
    insurance: data.insurance_company || null,
    incidentId: data.incident_id,
    incidentNumber,
    claimNumber: incidentNumber,
    insuranceId: data.insurance_id,
    fromDate: data.from_date,
    toDate: data.to_date,
    visits: (data.visits || []).map((visit) => ({
      id: visit.visit_id || String(visit.check_in_id),
      checkInId: visit.check_in_id,
      date: visit.check_in_date,
      dateValue: visit.check_in_date_value,
      label: visit.visit_label || "Visit",
      category: visit.category,
      documents: (visit.documents || [])
        .map((doc) => {
          const pathValue = (doc.path || "").trim();
          const isHttpUrl =
            /^https?:\/\//i.test(pathValue) || pathValue.startsWith("/");
          const apiFileUrl = insuranceVisitDocumentFileUrl(
            data.patient_id,
            doc.id
          );
          // Same as employer: auth file stream or browser-reachable HTTP — never sample PDF.
          const url = apiFileUrl || (isHttpUrl ? pathValue : null);
          if (!url) return null;
          return {
            id: String(doc.id),
            documentId: String(doc.id),
            checkInId: doc.check_in_id,
            reportId: doc.report_id,
            title: doc.report_name || doc.name,
            name: doc.name,
            documentType: doc.report_name,
            previewBadge: doc.preview_badge,
            previewLabel: doc.preview_label || doc.preview_badge,
            badgeLabel: doc.report_name,
            path: pathValue || null,
            url,
            visitDate: visit.check_in_date,
            reportDate: visit.check_in_date,
            isCompleted: doc.is_completed,
          };
        })
        .filter(Boolean),
    })),
  };
}

export async function fetchInsuranceSharedDocumentBySharedId(
  accessToken,
  sharedId
) {
  const data = await insuranceFetch(
    `/api/insurance/shared-documents/by-shared-id/${encodeURIComponent(sharedId)}`,
    accessToken,
    "Unable to load shared document."
  );

  const fileUrl = insuranceSharedDocumentFileUrl(data.shared_id);
  const employee = data.employee || {};

  return {
    sharedId: data.shared_id,
    documentId: data.document_id,
    documentType: data.document_type || data.report_title || "Shared document",
    reportTitle: data.report_title || data.document_type || "Shared document",
    fileName: data.file_name || null,
    visitDate: data.visit_date || null,
    visitLabel: data.visit_label || "Visit",
    employee: {
      patientId: employee.patient_id ?? null,
      name: employee.name || "Patient",
      accountNo: employee.account_no || null,
      dateOfBirth: employee.date_of_birth || null,
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
      visitDate: data.visit_date || null,
      reportDate: data.visit_date || null,
      provider: null,
      url: fileUrl,
    },
  };
}
