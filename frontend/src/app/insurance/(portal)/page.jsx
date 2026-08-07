import { redirect } from "next/navigation";
import { insurancePaths } from "@/lib/portal-paths";

export default function Page() {
  redirect(insurancePaths.dashboard);
}
