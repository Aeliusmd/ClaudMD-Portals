/** Visits and appointments are surfaced on the dashboard itself, so they are not separate nav items. */
export const patientNavItems = [
  { href: "/patient/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/patient/my-information", label: "My Information", icon: "User" },
  { href: "/patient/profile", label: "Profile / Security", icon: "Shield" },
];

/** Primary nav matches current wireframe (https://lgcoqk.readdy.co/). Extra routes remain available via dashboard deep-links. */
export const employerNavItems = [
  { href: "/employer/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  {
    href: "/employer/authorizations",
    label: "Authorizations",
    icon: "ClipboardCheck",
  },
  { href: "/employer/profile", label: "Profile / Security", icon: "Shield" },
];

export const insuranceNavItems = [
  { href: "/insurance/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/insurance/profile", label: "Profile / Security", icon: "Shield" },
];

/** Epic 4 scoped session — only Shared Documents (secure email link). */
export const employerScopedShareNavItems = [
  {
    href: "/employer/shared-documents/scoped",
    label: "Shared Documents",
    icon: "FileText",
  },
];
