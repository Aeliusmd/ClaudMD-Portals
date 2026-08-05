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
    appointments: data.appointments ?? 0,
    days: data.days ?? 30,
    employerId: data.employer_id,
  };
}

function mapUpcomingAppointment(row) {
  return {
    id: row.id,
    employee: row.employee_name,
    employeeId: row.employee_id,
    patientId: row.patient_id,
    category: row.category || "Injury",
    visitType: row.visit_type,
    type: row.visit_type,
    provider: row.provider || "—",
    clinic: row.clinic || "—",
    date: row.date,
    dateValue: row.date_value,
    time: row.time || "—",
    status: row.status || "Scheduled",
  };
}

export async function fetchEmployerUpcomingAppointments(
  accessToken,
  { page = 1, pageSize = 10 } = {}
) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));

  const data = await employerFetch(
    `/api/employer/appointments/upcoming?${params.toString()}`,
    accessToken,
    "Unable to load upcoming appointments."
  );

  return {
    items: (data.items || []).map(mapUpcomingAppointment),
    total: data.total ?? 0,
    page: data.page ?? page,
    pageSize: data.page_size ?? pageSize,
    totalPages: data.total_pages ?? 1,
    employerId: data.employer_id,
  };
}

function genderLabel(genderId, gender) {
  if (gender === "Male" || gender === "M" || genderId === 1) return "M";
  if (gender === "Female" || gender === "F" || genderId === 2) return "F";
  if (gender) return String(gender).charAt(0).toUpperCase();
  return "—";
}

function formatAccountNo(accountNo) {
  if (accountNo == null || accountNo === "") return null;
  const raw = String(accountNo).trim();
  if (!raw) return null;
  if (/^ACC-/i.test(raw)) return raw.toUpperCase();
  return `ACC-${raw}`;
}

function mapEmployeeSearchRow(row) {
  const category = row.category || null;
  const accountNo = formatAccountNo(row.account_no);
  const patientId = accountNo
    ? `P-${String(row.account_no).replace(/^ACC-/i, "")}`
    : row.employee_id
      ? `P-${row.employee_id}`
      : null;
  return {
    id: row.id,
    patientId: row.patient_id,
    checkInId: row.check_in_id,
    employeeId: String(row.employee_id),
    employeeName: row.employee_name,
    employee: row.employee_name,
    accountNo,
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
    displayPatientId: patientId,
  };
}

export function searchRowToEmployee(row) {
  if (!row) return null;
  const accountNo = row.accountNo || formatAccountNo(row.account_no);
  const patientId =
    row.displayPatientId ||
    (accountNo
      ? `P-${String(accountNo).replace(/^ACC-/i, "")}`
      : row.employeeId
        ? `P-${row.employeeId}`
        : null);

  return {
    id: String(row.employeeId),
    name: row.employeeName || row.employee,
    patientId,
    accountNo,
    employerName: row.employerName,
    phone: row.phone,
    dateOfBirth: row.dateOfBirth,
    gender: genderLabel(row.genderId, row.gender),
    address: row.address,
    email: row.email,
    incidents: [
      {
        id: row.incidentId || row.checkInId,
        incidentNumber: row.incidentNumber || "N/A",
        category: row.category,
        checkInDate: row.date || row.lastVisit,
        dateOfInjury: row.dateOfInjury,
        timeOfInjury: row.timeOfInjury,
        reportType: row.reportType || row.category || "Visit",
        workStatus: row.workStatus || "—",
        visits: [
          {
            id: String(row.checkInId || row.id),
            date: row.date || row.lastVisit || "—",
            label: row.reportType || row.category || "Visit",
            category: row.category,
          },
        ],
      },
    ],
  };
}

export async function fetchEmployerEmployeeSearch(
  accessToken,
  {
    fromDate,
    toDate,
    page = 1,
    pageSize = 10,
    search,
    category,
    patientId,
  } = {}
) {
  const params = new URLSearchParams();
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (search) params.set("search", search);
  if (category) params.set("category", category);
  if (patientId != null && patientId !== "") {
    params.set("patientId", String(patientId));
  }
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
    page: data.page ?? page,
    pageSize: data.page_size ?? pageSize,
    totalPages: data.total_pages ?? 1,
    fromDate: data.from_date,
    toDate: data.to_date,
    employerId: data.employer_id,
  };
}
