import { fetchJson } from "@/lib/api/http";
import { employerVisitDocumentFileUrl } from "@/lib/documents";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

async function employerFetch(
  path,
  accessToken,
  fallbackMessage,
  { method = "GET", body } = {}
) {
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  return fetchJson(
    `${API_BASE_URL}${path}`,
    {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
    fallbackMessage
  );
}

export async function fetchEmployerProfile(accessToken) {
  const data = await employerFetch(
    "/api/employer/me",
    accessToken,
    "Unable to load employer profile."
  );

  let firstName = data.first_name || "";
  let lastName = data.last_name || "";
  if (!firstName && !lastName && data.full_name) {
    const parts = String(data.full_name).trim().split(/\s+/).filter(Boolean);
    firstName = parts[0] || "";
    lastName = parts.slice(1).join(" ");
  }

  return {
    fullName: data.full_name,
    firstName,
    lastName,
    title: data.title || "",
    role: data.type_label || null,
    jobTitle: data.title || null,
    email: data.email || "",
    phone: data.phone || "",
    organization: data.organization || "",
    address: data.address || "",
    employerId: data.employer_id,
    userId: data.user_id,
    loginId: data.login_id,
    typeId: data.type_id,
    typeLabel: data.type_label,
  };
}

export async function updateEmployerProfile(accessToken, payload) {
  const data = await employerFetch(
    "/api/employer/me",
    accessToken,
    "Unable to update employer profile.",
    {
      method: "PATCH",
      body: {
        first_name: payload.firstName,
        last_name: payload.lastName ?? "",
        title: payload.title || null,
        email: payload.email,
        phone: payload.phone || null,
      },
    }
  );

  return {
    fullName: data.full_name,
    firstName: data.first_name || "",
    lastName: data.last_name || "",
    title: data.title || "",
    role: data.type_label || null,
    jobTitle: data.title || null,
    email: data.email || "",
    phone: data.phone || "",
    organization: data.organization || "",
    address: data.address || "",
    employerId: data.employer_id,
    userId: data.user_id,
    loginId: data.login_id,
    typeId: data.type_id,
    typeLabel: data.type_label,
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
    unreadReports: data.unread_reports ?? 0,
    days: data.days ?? 30,
    employerId: data.employer_id,
  };
}

export async function fetchEmployerNotifications(
  accessToken,
  { page = 1, pageSize = 10 } = {}
) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  const data = await employerFetch(
    `/api/employer/notifications?${params.toString()}`,
    accessToken,
    "Unable to load notifications."
  );

  return {
    items: (data.items || []).map((row) => ({
      id: row.id,
      message: row.message,
      timeAgo: row.time_ago || "",
      unread: Boolean(row.unread),
      href: row.href || null,
      source: row.source,
      sourceId: row.source_id,
      createdAt: row.created_at,
    })),
    total: data.total ?? 0,
    unreadCount: data.unread_count ?? 0,
    page: data.page ?? page,
    pageSize: data.page_size ?? pageSize,
    totalPages: data.total_pages ?? 1,
    days: data.days ?? 30,
    employerId: data.employer_id,
  };
}

export async function markEmployerNotificationsRead(accessToken) {
  const data = await employerFetch(
    "/api/employer/notifications/mark-read",
    accessToken,
    "Unable to mark notifications as read.",
    { method: "POST" }
  );

  return {
    updatedCount: data.updated_count ?? 0,
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

export async function fetchAppointmentLocations(accessToken) {
  const data = await employerFetch(
    "/api/employer/appointments/locations",
    accessToken,
    "Unable to load locations."
  );
  return (data || []).map((row) => ({
    id: row.id,
    name: row.short_name
      ? `${row.name} (${row.short_name})`
      : row.name,
    shortName: row.short_name,
  }));
}

export async function fetchAppointmentVisitTypes(accessToken) {
  const data = await employerFetch(
    "/api/employer/appointments/visit-types",
    accessToken,
    "Unable to load visit types."
  );
  return (data || []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    categoryId: row.category_id,
    label: row.code ? `${row.name} (${row.code})` : row.name,
  }));
}

export async function fetchAppointmentPatients(accessToken, { search } = {}) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const qs = params.toString();
  const data = await employerFetch(
    `/api/employer/appointments/patients${qs ? `?${qs}` : ""}`,
    accessToken,
    "Unable to load patients."
  );
  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    firstName: row.first_name,
    lastName: row.last_name,
    accountNo: row.account_no,
    ssn: row.ssn,
    dateOfBirth: row.date_of_birth,
    genderId: row.gender_id,
    gender: row.gender,
    phone: row.phone,
    locationId: row.location_id,
  }));
}

export async function fetchAppointmentProviders(
  accessToken,
  { locationId, date }
) {
  const params = new URLSearchParams();
  params.set("locationId", String(locationId));
  params.set("date", date);
  const data = await employerFetch(
    `/api/employer/appointments/providers?${params.toString()}`,
    accessToken,
    "Unable to load providers for this date."
  );
  return (data || []).map((row) => ({
    resourceId: row.resource_id,
    providerId: row.provider_id,
    name: row.name,
    resourceName: row.resource_name,
    providerName: row.provider_name,
    locationId: row.location_id,
    timeSlotMinutes: row.time_slot_minutes ?? 15,
    patientsPerSlot: row.patients_per_slot ?? 1,
    shifts: row.shifts || [],
  }));
}

export async function fetchAppointmentSlots(
  accessToken,
  { locationId, resourceId, date, durationMinutes }
) {
  const params = new URLSearchParams();
  params.set("locationId", String(locationId));
  params.set("resourceId", String(resourceId));
  params.set("date", date);
  params.set("durationMinutes", String(durationMinutes || 15));
  const data = await employerFetch(
    `/api/employer/appointments/slots?${params.toString()}`,
    accessToken,
    "Unable to load available time slots."
  );
  return {
    date: data.date,
    locationId: data.location_id,
    resourceId: data.resource_id,
    durationMinutes: data.duration_minutes,
    timeSlotMinutes: data.time_slot_minutes,
    patientsPerSlot: data.patients_per_slot,
    slotsNeeded: data.slots_needed,
    items: (data.items || []).map((row) => ({
      start: row.start,
      end: row.end,
      label: row.label,
      slotsUsed: row.slots_used,
    })),
  };
}

export async function bookAppointment(accessToken, payload) {
  const data = await employerFetch(
    "/api/employer/appointments/book",
    accessToken,
    "Unable to book appointment.",
    {
      method: "POST",
      body: {
        patient_id: payload.patientId ?? null,
        new_patient: payload.newPatient
          ? {
              first_name: payload.newPatient.firstName,
              last_name: payload.newPatient.lastName,
              date_of_birth: payload.newPatient.dateOfBirth,
              gender: payload.newPatient.gender,
              gender_id: payload.newPatient.genderId,
              ssn: payload.newPatient.ssn,
              account_no: payload.newPatient.accountNo,
              phone: payload.newPatient.phone,
              address1: payload.newPatient.address1,
              address2: payload.newPatient.address2,
              city: payload.newPatient.city,
              state: payload.newPatient.state,
              zip_code: payload.newPatient.zipCode,
            }
          : null,
        location_id: payload.locationId,
        resource_id: payload.resourceId,
        visit_type_id: payload.visitTypeId,
        date: payload.date,
        start_time: payload.startTime,
        duration_minutes: payload.durationMinutes,
        appointment_status_id: payload.appointmentStatusId ?? 4,
        schedule_type_id: payload.scheduleTypeId ?? 1,
        note: payload.note || null,
      },
    }
  );

  return {
    executed: data.executed === true,
    message: data.message,
    employerId: data.employer_id,
    locationId: data.location_id,
    resourceId: data.resource_id,
    date: data.date,
    startTime: data.start_time,
    endTime: data.end_time,
    durationMinutes: data.duration_minutes,
    slotsNeeded: data.slots_needed,
    timeSlotMinutes: data.time_slot_minutes,
    warnings: data.warnings || [],
    patientId: data.patient_id,
    recurringId: data.recurring_id,
    appointmentId: data.appointment_id,
    scheduleId: data.schedule_id,
  };
}

/** @deprecated Use bookAppointment — still points at the booking endpoint. */
export async function prepareAppointmentInsert(accessToken, payload) {
  return bookAppointment(accessToken, payload);
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
    numericPatientId: row.patientId,
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
        id: row.incidentId || row.checkInId || row.patientId,
        incidentNumber: row.incidentNumber || "N/A",
        category: row.category,
        checkInDate: row.date || row.lastVisit,
        dateOfInjury: row.dateOfInjury,
        timeOfInjury: row.timeOfInjury,
        reportType: row.reportType || row.category || "Visit",
        workStatus: row.workStatus || "—",
        visits: row.checkInId
          ? [
              {
                id: `checkin-${row.checkInId}`,
                date: row.date || row.lastVisit || "—",
                label: row.reportType || row.category || "Visit",
                category: row.category,
                documents: [],
              },
            ]
          : [],
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

export async function fetchEmployeeVisits(
  accessToken,
  patientId,
  { fromDate, toDate } = {}
) {
  const params = new URLSearchParams();
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);
  const qs = params.toString();
  const path = `/api/employer/employees/${encodeURIComponent(patientId)}/visits${
    qs ? `?${qs}` : ""
  }`;

  const data = await employerFetch(
    path,
    accessToken,
    "Unable to load visit documents."
  );

  return {
    patientId: data.patient_id,
    employerId: data.employer_id,
    fromDate: data.from_date,
    toDate: data.to_date,
    visits: (data.visits || []).map((visit) => ({
      id: visit.visit_id || String(visit.check_in_id),
      visitId: visit.visit_id || String(visit.check_in_id),
      checkInId: visit.check_in_id,
      isUpcoming: visit.is_upcoming === true,
      scheduleId: visit.schedule_id,
      appointmentId: visit.appointment_id,
      date: visit.check_in_date,
      dateValue: visit.check_in_date_value,
      label: visit.visit_label || "Visit",
      category: visit.category,
      time: visit.time,
      endTime: visit.end_time,
      provider: visit.provider,
      clinic: visit.clinic,
      status: visit.status,
      durationMinutes: visit.duration_minutes,
      note: visit.note,
      documents: (visit.documents || [])
        .map((doc) => {
          const path = (doc.path || "").trim();
          const isHttpUrl = /^https?:\/\//i.test(path) || path.startsWith("/");
          const apiFileUrl = employerVisitDocumentFileUrl(
            data.patient_id,
            doc.id
          );
          // Only real DB-backed streams or browser-reachable HTTP paths — never sample/dummy PDFs.
          const url = apiFileUrl || (isHttpUrl ? path : null);
          if (!url) return null;
          return {
            id: String(doc.id),
            documentId: String(doc.id),
            checkInId: doc.check_in_id,
            reportId: doc.report_id,
            title: doc.report_name || doc.name,
            name: doc.name,
            documentType: doc.report_name,
            previewBadge: doc.preview_badge,
            previewLabel: doc.preview_label || doc.preview_badge,
            badgeLabel: doc.report_name,
            path: path || null,
            url,
            visitDate: visit.check_in_date,
            reportDate: visit.check_in_date,
            isCompleted: doc.is_completed,
          };
        })
        .filter(Boolean),
    })),
  };
}

export async function fetchEmployerOrganizationUsers(accessToken) {
  const data = await employerFetch(
    "/api/employer/organization-users",
    accessToken,
    "Unable to load organization users."
  );

  return {
    employerId: data.employer_id,
    organization: data.organization || "",
    total: data.total ?? 0,
    canManageAccess: Boolean(data.can_manage_access),
    items: (data.items || []).map((row) => mapOrganizationUser(row)),
  };
}

function mapOrganizationUser(row) {
  return {
    id: row.id,
    contactId: row.contact_id,
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email || "",
    title: row.title || "",
    loginId: row.login_id || "",
    typeId: row.type_id,
    typeLabel: row.type_label,
    role: row.role || row.type_label || "—",
    accessLevel: row.access_level,
    active: Boolean(row.active),
    contactType: row.contact_type || "",
    serviceType: row.service_type || "",
  };
}

export async function updateEmployerOrganizationUserAccess(
  accessToken,
  contactId,
  accessLevel
) {
  const data = await fetchJson(
    `${API_BASE_URL}/api/employer/organization-users/${encodeURIComponent(
      contactId
    )}/access`,
    {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ access_level: accessLevel }),
    },
    "Unable to update portal access."
  );

  return {
    canManageAccess: Boolean(data.can_manage_access),
    item: mapOrganizationUser(data.item),
  };
}
