import { fetchJson } from "@/lib/api/http";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export async function loginWithCredentials({
  username,
  password,
  activationKey,
  portal,
}) {
  return fetchJson(
    `${API_BASE_URL}/api/auth/login`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        username,
        password,
        activationKey,
        ...(portal ? { portal } : {}),
      }),
    },
    "Unable to sign in. Please try again."
  );
}

export async function changePassword({
  accessToken,
  currentPassword,
  newPassword,
  confirmPassword,
}) {
  return fetchJson(
    `${API_BASE_URL}/api/auth/change-password`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        currentPassword,
        newPassword,
        confirmPassword,
      }),
    },
    "Unable to update password. Please try again."
  );
}

export { resolvePortalDestination } from "@/lib/portal-paths";
