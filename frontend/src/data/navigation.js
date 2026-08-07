import { employerPaths, insurancePaths, patientPaths } from "@/lib/portal-paths";

/** Visits and appointments are surfaced on the dashboard itself, so they are not separate nav items. */
export const patientNavItems = [
  { href: patientPaths.dashboard, label: "Dashboard", icon: "LayoutDashboard" },
  {
    href: patientPaths.myInformation,
    label: "My Information",
    icon: "User",
  },
  { href: patientPaths.profile, label: "Profile / Security", icon: "Shield" },
];

/** Primary nav matches current wireframe (https://lgcoqk.readdy.co/). Extra routes remain available via dashboard deep-links. */
export const employerNavItems = [
  {
    href: employerPaths.dashboard,
    label: "Dashboard",
    icon: "LayoutDashboard",
  },
  // TEMP: hide Authorizations tab for all employer portal users.
  // {
  //   href: employerPaths.authorizations,
  //   label: "Authorizations",
  //   icon: "ClipboardCheck",
  // },
  {
    href: employerPaths.profile,
    label: "Profile / Security",
    icon: "Shield",
  },
];

export const insuranceNavItems = [
  {
    href: insurancePaths.dashboard,
    label: "Dashboard",
    icon: "LayoutDashboard",
  },
  {
    href: insurancePaths.profile,
    label: "Profile / Security",
    icon: "Shield",
  },
];

/** Epic 4 scoped session — only Shared Documents (secure email link). */
export const employerScopedShareNavItems = [
  {
    href: employerPaths.sharedDocumentsScoped,
    label: "Shared Documents",
    icon: "FileText",
  },
];
