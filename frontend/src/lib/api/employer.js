const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

async function employerFetch(path, accessToken, fallbackMessage) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
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
    throw error;
  }

  return data;
}

export async function fetchEmployerProfile(accessToken) {
  const data = await employerFetch(
    "/api/employer/me",
    accessToken,
    "Unable to load employer profile."
  );

  return {
    fullName: data.full_name,
    title: data.title || "Employer Contact",
    role: "Employer",
    email: data.email,
    phone: data.phone,
    organization: data.organization,
    employerId: data.employer_id,
    userId: data.user_id,
    loginId: data.login_id,
  };
}

export async function fetchDashboardSummary(accessToken) {
  const data = await employerFetch(
    "/api/employer/dashboard/summary",
    accessToken,
    "Unable to load dashboard summary."
  );

  return {
    employerId: data.employerId,
    employerName: data.employerName,
    fromDate: data.fromDate,
    toDate: data.toDate,
    last30Days: data.last30Days || {
      injury: 0,
      physicals: 0,
      drugScreens: 0,
      appointments: 0,
      unreadReports: 0,
    },
  };
}

export async function fetchEmployerEmployees(
  accessToken,
  { from, to, category, search } = {}
) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (category) params.set("category", category);
  if (search) params.set("search", search);
  const qs = params.toString();
  const path = `/api/employer/employees${qs ? `?${qs}` : ""}`;

  const data = await employerFetch(
    path,
    accessToken,
    "Unable to load employees."
  );

  return {
    employerId: data.employerId,
    count: data.count || 0,
    items: Array.isArray(data.items) ? data.items : [],
  };
}
