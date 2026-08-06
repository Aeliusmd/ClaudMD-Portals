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

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const detail =
      (data && (data.detail || data.message)) || fallbackMessage;
    const error = new Error(
      typeof detail === "string" ? detail : fallbackMessage
    );
    error.status = response.status;
    error.detail = detail;
    throw error;
  }

  return data;
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
    fullName: data.full_name,
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
