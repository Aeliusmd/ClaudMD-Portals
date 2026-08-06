export const categoryStyles = {
  "Urgent Care": "bg-amber-50 text-amber-800",
  "Personal Injury": "bg-rose-50 text-rose-700",
  Injury: "bg-accent-50 text-accent-700",
  Physical: "bg-secondary-100 text-secondary-700",
  "Drug Screen": "bg-amber-50 text-amber-800",
  Other: "bg-stone-100 text-stone-600",
};

export const coverageStyles = {
  "Workers Comp": "bg-accent-50 text-accent-700",
  "Private Insurance": "bg-secondary-100 text-secondary-700",
};

export const appointmentStatusStyles = {
  Confirmed: "bg-secondary-100 text-secondary-700",
  Pending: "bg-accent-50 text-accent-700",
  Completed: "bg-background-100 text-foreground-700",
};

export const specialtyStyles = {
  "Primary Care": "bg-secondary-100 text-secondary-700",
  Cardiology: "bg-accent-50 text-accent-700",
  Dermatology: "bg-accent-50 text-accent-700",
  Orthopedics: "bg-primary-100 text-primary-700",
  "Physical Therapy": "bg-amber-50 text-amber-700",
  "Urgent Care": "bg-amber-50 text-amber-800",
};

export function specialtyStyle(specialty) {
  return specialtyStyles[specialty] || "bg-background-100 text-foreground-700";
}

export const visitStatusStyles = {
  Completed: "bg-secondary-100 text-secondary-700",
};

export const authorizationStatusStyles = {
  Approved: "bg-secondary-100 text-secondary-700",
  Pending: "bg-amber-50 text-amber-700",
};

export const workStatusStyles = {
  "Regular Work": "bg-secondary-100 text-secondary-700",
  "Modified Duty": "bg-amber-50 text-amber-700",
  "Off Rest Off Shift": "bg-amber-50 text-amber-700",
  "Total Temporary Disabled": "bg-accent-50 text-accent-700",
  "Off Work": "bg-accent-50 text-accent-700",
  // Legacy mock labels (still used by static demo data)
  "Full duty": "bg-secondary-100 text-secondary-700",
  "Light duty": "bg-amber-50 text-amber-700",
  "Light duty — 4 weeks": "bg-amber-50 text-amber-700",
  "Modified schedule": "bg-amber-50 text-amber-700",
  "Off work": "bg-accent-50 text-accent-700",
  "Off work — 5 days": "bg-accent-50 text-accent-700",
  "Off work — 10 days": "bg-accent-50 text-accent-700",
  "Off work — pending MRI": "bg-accent-50 text-accent-700",
  "Off work — 2 weeks": "bg-accent-50 text-accent-700",
};

const workStatusPrefixStyles = [
  ["Off work", "bg-accent-50 text-accent-700"],
  ["Light duty", "bg-amber-50 text-amber-700"],
  ["Modified", "bg-amber-50 text-amber-700"],
  ["Full duty", "bg-secondary-100 text-secondary-700"],
];

/** Work statuses carry a free-text duration ("Off work — 3 weeks"), so fall back to the prefix. */
export function workStatusStyle(status) {
  if (workStatusStyles[status]) return workStatusStyles[status];
  const match = workStatusPrefixStyles.find(([prefix]) =>
    status?.startsWith(prefix)
  );
  return match ? match[1] : "bg-stone-100 text-stone-600";
}
