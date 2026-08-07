import { redirect } from "next/navigation";
import { patientPaths } from "@/lib/portal-paths";

export default function PatientIndexPage() {
  redirect(patientPaths.dashboard);
}
