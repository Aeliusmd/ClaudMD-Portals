const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export async function loginWithCredentials({
  username,
  password,
  activationKey,
}) {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      username,
      password,
      activationKey,
    }),
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
      "Unable to sign in. Please try again.";
    const error = new Error(
      typeof detail === "string" ? detail : "Unable to sign in. Please try again."
    );
    error.status = response.status;
    throw error;
  }

  return data;
}

export function resolvePortalDestination(portal) {
  if (portal === "employer") return "/employer/dashboard";
  if (portal === "patient") return "/patient/dashboard";
  return "/employer/dashboard";
}
