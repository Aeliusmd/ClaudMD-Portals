export const NOTES_MAX = 500;
export const SSN_PATTERN = /^\d{3}-\d{2}-\d{4}$/;
export const PHONE_PATTERN = /^\(\d{3}\)\s\d{3}-\d{4}$/;

export const employeeAuthExtras = {
  "ee-001": { gender: "Male", phone: "(555) 201-4421" },
  "ee-002": { gender: "Male", phone: "(555) 214-8820" },
  "ee-003": { gender: "Male", phone: "(555) 318-4402" },
  "ee-004": { gender: "Male", phone: "(555) 402-1198" },
  "ee-005": { gender: "Female", phone: "(555) 509-7731" },
  "ee-006": { gender: "Female", phone: "(555) 611-2284" },
  "ee-007": { gender: "Female", phone: "(555) 722-9033" },
  "ee-008": { gender: "Male", phone: "(555) 833-1147" },
};

export const serviceGroups = [
  {
    id: "treat-injury",
    label: "Treat Injury / Illness",
    children: [],
  },
  {
    id: "drug-screen",
    label: "Drug Screen",
    children: [
      { id: "drug-dot", label: "DOT" },
      { id: "drug-non-dot", label: "Non DOT" },
      { id: "drug-rapid", label: "Rapid UDS" },
    ],
  },
  {
    id: "physical-exam",
    label: "Physical Exam",
    children: [
      { id: "physical-post-offer", label: "Post Offer" },
      { id: "physical-ffd", label: "Fitness For Duty" },
    ],
  },
  { id: "breath-alcohol", label: "Breath Alcohol", children: [] },
  { id: "spirometry", label: "Spirometry", children: [] },
  { id: "respirator-fit", label: "Respirator Fit Testing", children: [] },
  { id: "audiometric", label: "Audiometric Testing", children: [] },
  {
    id: "functional-capacity",
    label: "Functional Capacity Testing (Functional Ergonomics)",
    children: [],
  },
  { id: "other-service", label: "Other", children: [] },
];

export const emptyForm = {
  employeeId: "",
  gender: "",
  dateOfBirth: "",
  ssn: "",
  companyName: "TechFlow Inc.",
  phone: "",
  natureOfInjury: "",
  services: {},
  notes: "",
};

export function parseDisplayDob(dob) {
  if (!dob) return "";
  const parsed = new Date(dob);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

export function formatTodayLabel() {
  return new Date().toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

export function collectSelectedServiceLabels(services) {
  const labels = [];
  for (const group of serviceGroups) {
    for (const child of group.children) {
      if (services[child.id]) labels.push(child.label);
    }
    if (group.children.length === 0 && services[group.id]) {
      labels.push(group.label);
    } else if (group.children.length > 0 && services[group.id]) {
      if (!group.children.some((child) => services[child.id])) {
        labels.push(group.label);
      }
    }
  }
  return labels;
}

export function validateForm(form) {
  const errors = {};

  if (!form.employeeId) {
    errors.employeeId = "Select an employee.";
  }
  if (!form.gender) {
    errors.gender = "Select a gender.";
  }
  if (!form.dateOfBirth) {
    errors.dateOfBirth = "Enter the employee date of birth.";
  }
  if (!form.ssn.trim()) {
    errors.ssn = "Enter a Social Security number.";
  } else if (!SSN_PATTERN.test(form.ssn.trim())) {
    errors.ssn = "Use the format XXX-XX-XXXX.";
  }
  if (!form.companyName.trim()) {
    errors.companyName = "Enter the company name.";
  }
  if (!form.phone.trim()) {
    errors.phone = "Enter a phone number.";
  } else if (!PHONE_PATTERN.test(form.phone.trim())) {
    errors.phone = "Use the format (555) 000-0000.";
  }
  if (!form.natureOfInjury.trim()) {
    errors.natureOfInjury = "Describe the nature of the injury or illness.";
  } else if (form.natureOfInjury.trim().length < 10) {
    errors.natureOfInjury =
      "Provide at least 10 characters describing the injury or illness.";
  }

  const selectedServices = collectSelectedServiceLabels(form.services);
  if (selectedServices.length === 0) {
    errors.services = "Select at least one service.";
  }

  if (form.notes.length > NOTES_MAX) {
    errors.notes = `Notes must be ${NOTES_MAX} characters or fewer.`;
  }

  return errors;
}
