export const patientNavItems = [
  { href: "/patient/dashboard", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/patient/my-information", label: "My Information", icon: "User" },
  { href: "/patient/visits", label: "Visits / Check-ins", icon: "ClipboardList" },
  { href: "/patient/appointments", label: "Appointments", icon: "CalendarDays" },
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
