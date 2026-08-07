"use client";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getAuthSession } from "@/lib/auth-session";
import { userTypeLabel } from "@/lib/user-type";

export default function InsuranceProfilePage() {
  const session = getAuthSession();
  const user = session?.user;
  const typeLabel =
    user?.type_label || userTypeLabel(user?.type_id) || "Insurance User";

  return (
    <div className="space-y-5">
      <PageHeader title="Profile / Security" />
      <Card className="space-y-3 p-5 text-sm">
        <p>
          <span className="font-semibold text-ink">Name: </span>
          {user?.name ||
            [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
            "—"}
        </p>
        <p>
          <span className="font-semibold text-ink">Email: </span>
          {user?.email || user?.login_id || "—"}
        </p>
        <p>
          <span className="font-semibold text-ink">Role: </span>
          {typeLabel}
        </p>
        <p className="text-muted">
          Password and security settings will be available in a later update.
        </p>
      </Card>
    </div>
  );
}
