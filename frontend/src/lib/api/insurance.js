const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

async function insuranceFetch(path, accessToken, fallbackMessage) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
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

export async function fetchInsuranceProfile(accessToken) {
  const data = await insuranceFetch(
    "/api/insurance/me",
    accessToken,
    "Unable to load insurance profile."
  );

  return {
    userId: data.user_id,
    insuranceId: data.insurance_id,
    insuranceContactId: data.insurance_contact_id,
    fullName: data.full_name,
    firstName: data.first_name,
    lastName: data.last_name,
    title: data.title,
    email: data.email,
    phone: data.phone,
    organization: data.organization,
    address: data.address,
    loginId: data.login_id,
    typeId: data.type_id,
    typeLabel: data.type_label,
  };
}

export async function fetchInsuranceDashboardSummary(accessToken) {
  const data = await insuranceFetch(
    "/api/insurance/dashboard/summary",
    accessToken,
    "Unable to load insurance dashboard summary."
  );

  return {
    workersComp: data.workers_comp ?? 0,
    privateInsurance: data.private_insurance ?? 0,
    unreadReports: data.unread_reports ?? 0,
    days: data.days ?? 30,
    insuranceId: data.insurance_id,
  };
}

function mapInsurancePatientRow(row) {
  const incidentNumber = row.incident_number || "N/A";
  return {
    id: String(row.id ?? row.patient_id),
    patientId: row.patient_id,
    checkInId: row.check_in_id,
    coverage: row.coverage || "Workers Comp",
    patient: row.patient_name,
    employer: row.employer_name || "—",
    insurance: row.insurance_company || null,
    accountNo: row.account_no != null ? String(row.account_no) : null,
    incidentId: row.incident_id,
    incidentNumber,
    // Private Insurance table labels this column "Claim #".
    claimNumber: incidentNumber,
    category: row.category || "—",
    lastVisit: row.last_visit || "—",
    lastVisitValue: row.last_visit_value,
    workStatus: row.work_status || "—",
    disabilityStatus: row.disability_status,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    phone: row.phone,
    email: row.email,
    address: row.address,
  };
}

export async function fetchInsurancePatientSearch(
  accessToken,
  {
    fromDate,
    toDate,
    page = 1,
    pageSize = 10,
    search,
    coverage = "workers_comp",
  } = {}
) {
  const params = new URLSearchParams();
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (search) params.set("search", search);
  if (coverage) params.set("coverage", coverage);
  const qs = params.toString();
  const path = `/api/insurance/patients/search${qs ? `?${qs}` : ""}`;

  const data = await insuranceFetch(
    path,
    accessToken,
    "Unable to load insurance patients."
  );

  return {
    items: (data.items || []).map(mapInsurancePatientRow),
    total: data.total ?? 0,
    page: data.page ?? page,
    pageSize: data.page_size ?? pageSize,
    totalPages: data.total_pages ?? 1,
    fromDate: data.from_date,
    toDate: data.to_date,
    insuranceId: data.insurance_id,
    coverage: data.coverage,
  };
}

export async function fetchInsurancePatientDetail(
  accessToken,
  patientId,
  { fromDate, toDate, coverage } = {}
) {
  const params = new URLSearchParams();
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);
  if (coverage) params.set("coverage", coverage);
  const qs = params.toString();
  const path = `/api/insurance/patients/${encodeURIComponent(patientId)}${
    qs ? `?${qs}` : ""
  }`;

  const data = await insuranceFetch(
    path,
    accessToken,
    "Unable to load patient details."
  );

  const incidentNumber = data.incident_number || null;

  return {
    id: String(data.patient_id),
    patientId: data.display_patient_id || `P-${data.patient_id}`,
    numericPatientId: data.patient_id,
    checkInId: data.check_in_id,
    coverage: data.coverage || "Workers Comp",
    patient: data.patient_name,
    accountNo: data.account_no != null ? String(data.account_no) : null,
    dateOfBirth: data.date_of_birth,
    gender: data.gender,
    phone: data.phone,
    email: data.email,
    addressLines: Array.isArray(data.address_lines) ? data.address_lines : [],
    employer: data.employer_name || null,
    insurance: data.insurance_company || null,
    incidentId: data.incident_id,
    incidentNumber,
    claimNumber: incidentNumber,
    insuranceId: data.insurance_id,
    fromDate: data.from_date,
    toDate: data.to_date,
    visits: (data.visits || []).map((visit) => ({
      id: visit.visit_id || String(visit.check_in_id),
      checkInId: visit.check_in_id,
      date: visit.check_in_date,
      dateValue: visit.check_in_date_value,
      label: visit.visit_label || "Visit",
      category: visit.category,
      documents: (visit.documents || []).map((doc) => {
        const pathValue = (doc.path || "").trim();
        const isHttpUrl =
          /^https?:\/\//i.test(pathValue) || pathValue.startsWith("/");
        return {
          id: String(doc.id),
          documentId: String(doc.id),
          checkInId: doc.check_in_id,
          reportId: doc.report_id,
          title: doc.report_name || doc.name,
          name: doc.name,
          previewBadge: doc.preview_badge,
          previewLabel: doc.preview_label || doc.preview_badge,
          path: pathValue || null,
          url: isHttpUrl ? pathValue : "/sample.pdf",
          visitDate: visit.check_in_date,
          reportDate: visit.check_in_date,
          isCompleted: doc.is_completed,
        };
      }),
    })),
  };
}
