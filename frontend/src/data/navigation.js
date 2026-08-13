import { employerPaths, insurancePaths, patientPaths } from "@/lib/portal-paths";

/** Visits and appointments are surfaced on the dashboard itself, so they are not separate nav items. */
export const patientNavItems = [
  { href: patientPaths.dashboard, label: "Dashboard", icon: "LayoutDashboard" },
  {
    href: patientPaths.myInformation,
    label: "My Information",
    icon: "User",
  },
  {
    href: patientPaths.support,
    label: "Support",
    icon: "LifeBuoy",
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
    href: employerPaths.support,
    label: "Support",
    icon: "LifeBuoy",
  },
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
    href: insurancePaths.support,
    label: "Support",
    icon: "LifeBuoy",
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

export const insuranceScopedShareNavItems = [
  {
    href: insurancePaths.sharedDocumentsScoped,
    label: "Shared Documents",
    icon: "FileText",
  },
];

export const patientScopedShareNavItems = [
  {
    href: patientPaths.sharedDocumentsScoped,
    label: "Shared Documents",
    icon: "FileText",
  },
];
