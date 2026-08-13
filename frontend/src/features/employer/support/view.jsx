"use client";

import { PortalSupportView } from "@/features/support/portal-support-view";
import { createSupportApi } from "@/lib/api/support";
import { EMPLOYER_LOGIN_PATH } from "@/lib/portal-paths";

const api = createSupportApi("/api/employer");

export function EmployerSupportView() {
  return <PortalSupportView api={api} loginPath={EMPLOYER_LOGIN_PATH} />;
}
