import { employerPaths, patientPaths } from "@/lib/portal-paths";

export const patientNavItems = [
  { href: patientPaths.dashboard, label: "Dashboard", icon: "LayoutDashboard" },
  {
    href: patientPaths.myInformation,
    label: "My Information",
    icon: "User",
  },
  {
    href: patientPaths.visits,
    label: "Visits / Check-ins",
    icon: "ClipboardList",
  },
  {
    href: patientPaths.appointments,
    label: "Appointments",
    icon: "CalendarDays",
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
  {
    href: employerPaths.authorizations,
    label: "Authorizations",
    icon: "ClipboardCheck",
  },
  {
    href: employerPaths.profile,
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
