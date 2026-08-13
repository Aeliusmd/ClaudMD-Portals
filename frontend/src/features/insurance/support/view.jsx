"use client";

import { PortalSupportView } from "@/features/support/portal-support-view";
import { createSupportApi } from "@/lib/api/support";
import { INSURANCE_LOGIN_PATH } from "@/lib/portal-paths";

const api = createSupportApi("/api/insurance");

export function InsuranceSupportView() {
  return <PortalSupportView api={api} loginPath={INSURANCE_LOGIN_PATH} />;
}
