import { redirect } from "next/navigation";
import { LOGIN_PATH } from "@/lib/auth-routes";

export default async function LegacyLoginRedirect({ searchParams }) {
  const params = await searchParams;
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params || {})) {
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(key, item));
    } else if (value != null && value !== "") {
      query.set(key, value);
    }
  }

  const qs = query.toString();
  redirect(qs ? `${LOGIN_PATH}?${qs}` : LOGIN_PATH);
}
