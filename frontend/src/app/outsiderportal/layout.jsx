"use client";

import { usePathname } from "next/navigation";

export default function OutsiderPortalLayout({ children }) {
  const pathname = usePathname() || "";
  const isAuth = pathname.includes("/authentication/");

  if (isAuth) {
    return (
      <div
        className="h-full w-full overflow-hidden bg-white"
        style={{ position: "absolute", inset: 0, margin: 0, padding: 0 }}
      >
        {children}
      </div>
    );
  }

  return <>{children}</>;
}
