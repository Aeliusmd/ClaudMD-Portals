import { fetchJson } from "@/lib/api/http";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

async function patientFetch(
  path,
  accessToken,
  fallbackMessage,
  { method = "GET", body } = {}
) {
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  return fetchJson(
    `${API_BASE_URL}${path}`,
    {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
    fallbackMessage
  );
}

function mapPatientProfile(data) {
  return {
    fullName: data.full_name || "",
    firstName: data.first_name || "",
    lastName: data.last_name || "",
    dateOfBirth: data.date_of_birth || "",
    email: data.email || "",
    phone: data.phone || "",
    address: data.address || "",
    patientId: data.patient_id,
    userId: data.user_id,
    loginId: data.login_id,
    typeId: data.type_id,
    typeLabel: data.type_label,
    role: data.type_label || null,
  };
}

export async function fetchPatientProfile(accessToken) {
  const data = await patientFetch(
    "/api/patient/me",
    accessToken,
    "Unable to load patient profile."
  );
  return mapPatientProfile(data);
}

export async function updatePatientProfile(accessToken, payload) {
  const data = await patientFetch(
    "/api/patient/me",
    accessToken,
    "Unable to update patient profile.",
    {
      method: "PATCH",
      body: {
        full_name: payload.fullName,
        date_of_birth: payload.dateOfBirth || null,
        email: payload.email,
        phone: payload.phone || null,
        address: payload.address || null,
      },
    }
  );
  return mapPatientProfile(data);
}

function formatDisplayDate(isoOrDisplay) {
  if (!isoOrDisplay) return "";
  const text = String(isoOrDisplay).trim();
  if (/^[A-Za-z]{3}\s+\d{1,2},\s+\d{4}$/.test(text)) return text;
  const iso = text.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return text;
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export async function fetchPatientMyInformation(accessToken) {
  const data = await patientFetch(
    "/api/patient/me/information",
    accessToken,
    "Unable to load my information."
  );

  const insurance = data.insurance || {};
  const employer = data.employer || {};

  return {
    patientId: data.patient_id,
    fullName: data.full_name || "",
    dateOfBirth: formatDisplayDate(data.date_of_birth),
    email: data.email || "",
    phone: data.phone || "",
    address: data.address || "",
    emergencyContact: data.emergency_contact || "",
    insurance: {
      carrier: insurance.carrier || "",
      policyNumber: insurance.policy_number || "",
      groupNumber: insurance.group_number || "",
      planType: insurance.plan_type || "",
      effectiveDate: formatDisplayDate(insurance.effective_date),
    },
    employer: {
      name: employer.name || "",
      department: employer.department || "",
    },
  };
}

export async function fetchPatientNotifications(
  accessToken,
  { page = 1, pageSize = 10 } = {}
) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  const data = await patientFetch(
    `/api/patient/notifications?${params.toString()}`,
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
    patientId: data.patient_id,
  };
}

export async function markPatientNotificationsRead(accessToken) {
  const data = await patientFetch(
    "/api/patient/notifications/mark-read",
    accessToken,
    "Unable to mark notifications as read.",
    { method: "POST" }
  );

  return {
    updatedCount: data.updated_count ?? 0,
    patientId: data.patient_id,
  };
}
