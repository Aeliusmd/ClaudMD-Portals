export const currentPatient = {
  id: "pat-001",
  fullName: "Alex Thompson",
  role: "Patient",
  dateOfBirth: "Mar 15, 1985",
  email: "alex.thompson@email.com",
  phone: "(555) 123-4567",
  address: "123 Oak Street, Suite 4B, Springfield, IL 62701",
  emergencyContact: "Jordan Thompson — (555) 987-6543",
  insurance: {
    carrier: "MedSure Health",
    policyNumber: "MSH-8847291",
    groupNumber: "GRP-4402-A",
    planType: "PPO — Gold Plan",
    effectiveDate: "Jan 1, 2026",
  },
  employer: {
    name: "TechFlow Inc.",
    department: "Engineering",
  },
  notifications: {
    appointmentReminders: true,
    newDocumentShared: true,
    visitUpdates: false,
    marketing: false,
  },
};

export const dashboardSummary = {
  upcomingAppointment: {
    date: "Jul 22, 2026",
    detail: "Dr. Sarah Williams · Annual Physical",
  },
  latestVisit: {
    date: "Jul 10, 2026",
    detail: "Physical",
  },
  newDocuments: {
    count: 2,
    detail: "Unread reports available",
  },
};
