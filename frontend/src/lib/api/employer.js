const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

async function employerFetch(path, accessToken, fallbackMessage) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const detail =
      (data && (data.detail || data.message)) || fallbackMessage;
    const error = new Error(
      typeof detail === "string" ? detail : fallbackMessage
    );
    error.status = response.status;
    throw error;
  }

  return data;
}

export async function fetchEmployerProfile(accessToken) {
  const data = await employerFetch(
    "/api/employer/me",
    accessToken,
    "Unable to load employer profile."
  );

  return {
    fullName: data.full_name,
    title: data.title || "Employer Contact",
    role: "Employer",
    email: data.email,
    phone: data.phone,
    organization: data.organization,
    employerId: data.employer_id,
    userId: data.user_id,
    loginId: data.login_id,
  };
}

export async function fetchEmployerDashboardSummary(accessToken) {
  const data = await employerFetch(
    "/api/employer/dashboard/summary",
    accessToken,
    "Unable to load dashboard summary."
  );

  return {
    injury: data.injury ?? 0,
    physicals: data.physicals ?? 0,
    drugScreens: data.drug_screens ?? 0,
    days: data.days ?? 30,
    employerId: data.employer_id,
  };
}

function genderLabel(genderId, gender) {
  if (gender) return gender;
  if (genderId === 1) return "Male";
  if (genderId === 2) return "Female";
  return "—";
}

function mapEmployeeSearchRow(row) {
  const category = row.category || null;
  return {
    id: row.id,
    patientId: row.patient_id,
    checkInId: row.check_in_id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    employee: row.employee_name,
    accountNo: row.account_no,
    ssnLast4: row.ssn_last4,
    ssn: row.ssn,
    employerName: row.employer_name,
    insuranceCompany: row.insurance_company || "—",
    incidentId: row.incident_id,
    incidentNumber: row.incident_number || "N/A",
    category,
    date: row.check_in_date,
    dateValue: row.check_in_date_value,
    lastVisit: row.check_in_date,
    lastVisitValue: row.check_in_date_value,
    dateOfInjury: row.date_of_injury,
    timeOfInjury: row.time_of_injury,
    reportType: row.report_type || "Status Report",
    workStatus: row.work_status || "—",
    disabilityStatus: row.disability_status,
    disabilityLabel: row.disability_status,
    unreadReportCount: row.unread_report_count ?? 0,
    appointmentCount: row.appointment_count ?? 0,
    isDrugScreen: category === "Drug Screen",
    dateOfBirth: row.date_of_birth,
    genderId: row.gender_id,
    gender: genderLabel(row.gender_id, row.gender),
    phone: row.phone,
    email: row.email,
    address: row.address,
    city: row.city,
    state: row.state,
    zipCode: row.zip_code,
  };
}

export function searchRowToEmployee(row) {
  if (!row) return null;
  return {
    id: row.employeeId,
    name: row.employeeName,
    patientId: row.accountNo ? `P-${row.accountNo}` : row.employeeId,
    accountNo: row.accountNo,
    employerName: row.employerName,
    phone: row.phone,
    dateOfBirth: row.dateOfBirth,
    gender: row.gender || genderLabel(row.genderId),
    address: row.address,
    incidents: [
      {
        id: row.incidentId || row.checkInId,
        incidentNumber: row.incidentNumber,
        category: row.category,
        checkInDate: row.date,
        dateOfInjury: row.dateOfInjury,
        timeOfInjury: row.timeOfInjury,
        reportType: row.reportType,
        workStatus: row.workStatus,
        visits: [
          {
            id: String(row.checkInId),
            date: row.date,
            label: row.reportType,
            category: row.category,
          },
        ],
      },
    ],
  };
}

export async function fetchEmployerEmployeeSearch(
  accessToken,
  { fromDate, toDate } = {}
) {
  const params = new URLSearchParams();
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);
  const qs = params.toString();
  const path = `/api/employer/employees/search${qs ? `?${qs}` : ""}`;

  const data = await employerFetch(
    path,
    accessToken,
    "Unable to load employee search results."
  );

  return {
    items: (data.items || []).map(mapEmployeeSearchRow),
    total: data.total ?? 0,
    fromDate: data.from_date,
    toDate: data.to_date,
    employerId: data.employer_id,
  };
}
