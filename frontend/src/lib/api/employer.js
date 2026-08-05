const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export async function fetchEmployerProfile(accessToken) {
  const response = await fetch(`${API_BASE_URL}/api/employer/me`, {
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
      (data && (data.detail || data.message)) ||
      "Unable to load employer profile.";
    const error = new Error(
      typeof detail === "string" ? detail : "Unable to load employer profile."
    );
    error.status = response.status;
    throw error;
  }

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
