/** Demo patient billing — UI only, not wired to clinic APIs. */

export const patientReviewBills = [
  {
    id: "pbill-0042",
    incidentNo: "CLM-P-0042",
    incident: "Allergic Reaction",
    provider: "Dr. Emily Carter",
    insurance: "Aetna",
    visit: "UC",
    category: "urgentCare",
    categoryLabel: "Urgent Care",
    doi: "07/18/2026",
    amount: 50,
  },
  {
    id: "pbill-0041",
    incidentNo: "CLM-P-0041",
    incident: "Allergic Reaction",
    provider: "Urgent Care West Pharmacy",
    insurance: "Aetna",
    visit: "RX",
    category: "urgentCare",
    categoryLabel: "Urgent Care",
    doi: "07/18/2026",
    amount: 25,
  },
  {
    id: "pbill-0031",
    incidentNo: "CLM-P-0031",
    incident: "Slip & Fall",
    provider: "Dr. James Rivera",
    insurance: "Blue Cross Blue Shield",
    visit: "INIT",
    category: "personalInjury",
    categoryLabel: "Personal Injury",
    doi: "07/03/2026",
    amount: 180,
  },
  {
    id: "pbill-0030",
    incidentNo: "CLM-P-0030",
    incident: "Slip & Fall",
    provider: "Westside Rehab",
    insurance: "Blue Cross Blue Shield",
    visit: "PT",
    category: "personalInjury",
    categoryLabel: "Personal Injury",
    doi: "07/03/2026",
    amount: 45,
  },
];

export const patientPaidBills = [
  {
    id: "ppaid-0018",
    invoiceNo: "INV-P-2026-0018",
    provider: "Dr. Emily Carter",
    incident: "Allergic Reaction",
    type: "Urgent Care",
    doi: "06/05/2026",
    amount: 50,
  },
  {
    id: "ppaid-0014",
    invoiceNo: "INV-P-2026-0014",
    provider: "Dr. James Rivera",
    incident: "Slip & Fall",
    type: "Personal Injury",
    doi: "06/12/2026",
    amount: 120,
  },
  {
    id: "ppaid-0009",
    invoiceNo: "INV-P-2026-0009",
    provider: "Urgent Care West",
    incident: "Laceration",
    type: "Urgent Care",
    doi: "05/20/2026",
    amount: 75,
  },
  {
    id: "ppaid-0004",
    invoiceNo: "INV-P-2026-0004",
    provider: "Dr. Emily Carter",
    incident: "Acute Illness",
    type: "Urgent Care",
    doi: "05/02/2026",
    amount: 30,
  },
];

export function summarizePatientReviewBills(bills) {
  const urgentCare = bills.filter((b) => b.category === "urgentCare");
  const personalInjury = bills.filter((b) => b.category === "personalInjury");
  const urgentCareTotal = urgentCare.reduce((sum, b) => sum + b.amount, 0);
  const personalInjuryTotal = personalInjury.reduce((sum, b) => sum + b.amount, 0);
  return {
    urgentCareCount: urgentCare.length,
    urgentCareTotal,
    personalInjuryCount: personalInjury.length,
    personalInjuryTotal,
    outstandingTotal: urgentCareTotal + personalInjuryTotal,
  };
}
