import { redirect } from "next/navigation";
import { outsiderPaths } from "@/lib/portal-paths";

export default function OutsiderPortalHomePage() {
  redirect(outsiderPaths.sharedDocuments);
}
