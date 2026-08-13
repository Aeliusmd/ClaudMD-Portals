"use client";

import { PortalSupportView } from "@/features/support/portal-support-view";
import { createSupportApi } from "@/lib/api/support";
import { PATIENT_LOGIN_PATH } from "@/lib/portal-paths";

const api = createSupportApi("/api/patient");

export function PatientSupportView() {
  return <PortalSupportView api={api} loginPath={PATIENT_LOGIN_PATH} />;
}
