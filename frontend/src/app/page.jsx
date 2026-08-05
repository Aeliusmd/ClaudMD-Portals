import { redirect } from "next/navigation";
import { LOGIN_PATH } from "@/lib/auth-routes";

export default function HomePage() {
  redirect(LOGIN_PATH);
}
