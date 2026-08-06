"use client";

import { usePathname } from "next/navigation";
import { InsuranceShell } from "@/components/layout/insurance-shell";

export default function InsuranceLayout({ children }) {
  const pathname = usePathname() || "";
  if (pathname.includes("/authentication/")) {
    return (
      <div
        className="h-full w-full overflow-hidden bg-white"
        style={{ position: "absolute", inset: 0, margin: 0, padding: 0 }}
      >
        {children}
      </div>
    );
  }
  return <InsuranceShell>{children}</InsuranceShell>;
}
