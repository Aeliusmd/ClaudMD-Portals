import { fetchJson } from "@/lib/api/http";
import { withAuthHeaders } from "@/lib/auth-session";
import {
  employerSharedDocumentFileUrl,
  employerVisitDocumentFileUrl,
} from "@/lib/documents";
import { formatDateMMDDYY, formatDateMMDDYYYY } from "@/lib/dates";
import { mapPreviousVisitVersions } from "@/lib/visit-document-map";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

async function employerFetch(
  path,
  accessToken,
  fallbackMessage,
  { method = "GET", body } = {}
) {
  const headers = withAuthHeaders(accessToken, {
    Accept: "application/json",
  });
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
    fullName: [firstName, lastName].filter(Boolean).join(" ") || data.full_name || "",
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
    userGroupId: data.user_group_id ?? null,
    isAdmin: Boolean(data.is_admin),
    activationKey: data.activation_key || null,
    databaseName: data.database_name || null,
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

  const firstName = data.first_name || "";
  const lastName = data.last_name || "";
  return {
    fullName: [firstName, lastName].filter(Boolean).join(" ") || data.full_name || "",
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
    userGroupId: data.user_group_id ?? null,
    isAdmin: Boolean(data.is_admin),
  };
}

export async function fetchEmployerPaidBills(accessToken) {
  const data = await employerFetch(
    "/api/employer/billing/paid",
    accessToken,
    "Unable to load paid bills."
  );

  return {
    items: (data.items || []).map((row) => ({
      id: row.id,
      invoiceNo: row.invoice_no,
      patientName: row.patient_name || null,
      description: row.description || "Invoice payment",
      category: row.category || null,
      paidOn: row.paid_on || null,
      amount: Number(row.amount) || 0,
      status: row.status || "Paid",
    })),
    total: data.total ?? 0,
    totalPaid: Number(data.total_paid) || 0,
    employerId: data.employer_id,
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
  return (data || []).map((row) => {
    const categoryId = row.category_id ?? row.categoryId ?? null;
    const code = (row.code || "").trim();
    const name = row.name || "Visit type";
    // Same employer portal buckets used elsewhere (Injury / Physical / Drug Screen).
    let categoryLabel = null;
    if (code.toUpperCase() === "PDS") {
      categoryLabel = "Drug Screen";
    } else if (categoryId === 1) {
      categoryLabel = "Injury";
    } else if (categoryId === 2) {
      categoryLabel = "Physical";
    } else if (categoryId === 3) {
      categoryLabel = "Urgent Care";
    } else if (categoryId === 4) {
      categoryLabel = "Personal Injury";
    }
    return {
      id: row.id,
      code: row.code,
      name,
      categoryId,
      category: categoryLabel,
      label: categoryLabel
        ? `${name} (${categoryLabel})`
        : code
          ? `${name} (${code})`
          : name,
    };
  });
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
    dateOfBirth: formatDateMMDDYYYY(row.date_of_birth) || row.date_of_birth,
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
  { locationId, resourceId, date, durationMinutes, patientId }
) {
  const params = new URLSearchParams();
  params.set("locationId", String(locationId));
  params.set("resourceId", String(resourceId));
  params.set("date", date);
  params.set("durationMinutes", String(durationMinutes || 15));
  if (patientId != null && patientId !== "") {
    params.set("patientId", String(patientId));
  }
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
        appointment_status_id: payload.appointmentStatusId ?? 1,
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
    patientSsn: data.patient_ssn ?? data.patientSsn ?? null,
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
      date: formatDateMMDDYY(row.check_in_date) || row.check_in_date,
    dateValue: row.check_in_date_value,
    lastVisit: formatDateMMDDYY(row.check_in_date) || row.check_in_date,
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
    dateOfBirth: formatDateMMDDYYYY(row.date_of_birth) || row.date_of_birth,
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
  { fromDate, toDate, category } = {}
) {
  const params = new URLSearchParams();
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);
  if (category) params.set("category", category);
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
      date: formatDateMMDDYY(visit.check_in_date) || visit.check_in_date,
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
            visitDate: formatDateMMDDYY(visit.check_in_date) || visit.check_in_date,
            reportDate: formatDateMMDDYY(visit.check_in_date) || visit.check_in_date,
            isCompleted: doc.is_completed,
            publishedAt: doc.published_at ?? null,
            versionTag: doc.version_tag ?? null,
            previousVersions: mapPreviousVisitVersions(
              doc.previous_versions,
              (previousId) => employerVisitDocumentFileUrl(data.patient_id, previousId)
            ),
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
    userGroupId: row.user_group_id ?? null,
    isAdmin: Boolean(row.is_admin),
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
    `${API_BASE_URL}/api/employer/organization-users/${encodeURIComponent(contactId)}/access`,
    {
      method: "PATCH",
      headers: withAuthHeaders(accessToken, {
        Accept: "application/json",
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ access_level: accessLevel }),
    },
    "Unable to update portal access."
  );

  return {
    canManageAccess: Boolean(data.can_manage_access),
    item: mapOrganizationUser(data.item),
  };
}

export async function fetchSharedDocumentBySharedId(accessToken, sharedId) {
  const data = await employerFetch(
    `/api/employer/shared-documents/by-shared-id/${encodeURIComponent(sharedId)}`,
    accessToken,
    "Unable to load shared document."
  );

  const fileUrl = employerSharedDocumentFileUrl(data.shared_id);
  const employee = data.employee || {};

  return {
    sharedId: data.shared_id,
    documentId: data.document_id,
    documentType: data.document_type || data.report_title || "Shared document",
    reportTitle: data.report_title || data.document_type || "Shared document",
    fileName: data.file_name || null,
    visitDate: formatDateMMDDYY(data.visit_date) || data.visit_date || null,
    visitLabel: data.visit_label || "Visit",
    publishedAt: data.published_at || data.publishedAt || null,
    sharedAt: data.shared_at || data.sharedAt || null,
    employee: {
      patientId: employee.patient_id ?? null,
      name: employee.name || "Employee",
      accountNo: employee.account_no || null,
      dateOfBirth: formatDateMMDDYYYY(employee.date_of_birth) || employee.date_of_birth || null,
      gender: employee.gender || null,
      phone: employee.phone || null,
      address: employee.address || null,
    },
    document: {
      id: String(data.document_id),
      documentId: String(data.document_id),
      title: data.report_title || data.document_type || data.file_name,
      documentType: data.document_type || data.report_title,
      previewLabel: "Report",
      previewBadge:
        String(data.document_type || data.report_title || "")
          .toLowerCase()
          .includes("doctor") &&
        String(data.document_type || data.report_title || "")
          .toLowerCase()
          .includes("first")
          ? "DFR"
          : "DOC",
      visitDate: formatDateMMDDYY(data.visit_date) || data.visit_date || null,
      reportDate: formatDateMMDDYY(data.visit_date) || data.visit_date || null,
      publishedAt: data.published_at || data.publishedAt || null,
      provider: null,
      url: fileUrl,
    },
  };
}

function mapSupportUser(user) {
  if (!user) return null;
  return {
    userId: user.user_id ?? user.userId ?? null,
    fullName: user.full_name || user.fullName || "",
    email: user.email || null,
    displayLabel: user.display_label || user.displayLabel || user.email || user.full_name || "",
  };
}

function mapSupportMessage(row) {
  return {
    id: String(row.id),
    subject: row.subject || "",
    body: row.body || "",
    category: row.category || "internal",
    categoryLabel: row.category_label || row.categoryLabel || "Internal",
    toEmail: row.to_email || row.toEmail || null,
    fromEmail: row.from_email || row.fromEmail || null,
    fromName: row.from_name || row.fromName || null,
    clinicName: row.clinic_name || row.clinicName || null,
    organization: row.organization || null,
    status: row.status || "sent",
    deliveryNote: row.delivery_note || row.deliveryNote || null,
    createdAt: row.created_at || row.createdAt || null,
    preview: row.preview || null,
    fromUser: mapSupportUser(row.from_user || row.fromUser),
    toUser: mapSupportUser(row.to_user || row.toUser),
    ccUsers: (row.cc_users || row.ccUsers || []).map(mapSupportUser).filter(Boolean),
    ccLabels: row.cc_labels || row.ccLabels || [],
    attachments: (row.attachments || []).map((item) => ({
      id: item.id,
      fileName: item.file_name || item.fileName || "file",
      mailInboxId: item.mail_inbox_id ?? item.mailInboxId ?? null,
    })),
    direction: row.direction || row.status || "sent",
    isSeen: Boolean(row.is_seen ?? row.isSeen),
  };
}

export async function fetchEmployerSupportClinic(accessToken) {
  const data = await employerFetch(
    "/api/employer/support/clinic",
    accessToken,
    "Unable to load clinic support details."
  );
  return {
    clinicName: data.clinic_name || "Clinic",
    clinicEmail: data.clinic_email || null,
    locationId: data.location_id ?? null,
    canSend: Boolean(data.can_send),
    smtpConfigured: Boolean(data.smtp_configured),
    employerId: data.employer_id ?? null,
    fromEmail: data.from_email || null,
    fromName: data.from_name || null,
    fromUserId: data.from_user_id ?? data.fromUserId ?? null,
  };
}

export async function fetchEmployerSupportRecipients(accessToken, { search = "" } = {}) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const suffix = params.toString() ? `?${params}` : "";
  const data = await employerFetch(
    `/api/employer/support/recipients${suffix}`,
    accessToken,
    "Unable to load clinic users."
  );
  return {
    clinicName: data.clinic_name || null,
    total: data.total ?? 0,
    items: (data.items || []).map((row) => ({
      userId: row.user_id,
      fullName: row.full_name || "",
      email: row.email || null,
      loginId: row.login_id || null,
      occupation: row.occupation || null,
      displayLabel: row.display_label || row.email || row.full_name || "",
      typeId: row.type_id ?? null,
    })),
  };
}

export async function fetchEmployerSupportMessages(
  accessToken,
  { page = 1, pageSize = 10 } = {}
) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  const data = await employerFetch(
    `/api/employer/support/messages?${params}`,
    accessToken,
    "Unable to load support messages."
  );
  return {
    items: (data.items || []).map(mapSupportMessage),
    total: data.total ?? 0,
    page: data.page ?? page,
    pageSize: data.page_size ?? pageSize,
    totalPages: data.total_pages ?? 1,
    clinicName: data.clinic_name || null,
    clinicEmail: data.clinic_email || null,
  };
}

export async function fetchEmployerSupportMessage(accessToken, messageId) {
  const data = await employerFetch(
    `/api/employer/support/messages/${encodeURIComponent(messageId)}`,
    accessToken,
    "Unable to load support message."
  );
  return mapSupportMessage(data);
}

export async function sendEmployerSupportMessage(accessToken, payload) {
  const form = new FormData();
  form.append("toUserId", String(payload.toUserId));
  form.append("subject", payload.subject || "");
  form.append("body", payload.body || "");
  if (Array.isArray(payload.ccUserIds) && payload.ccUserIds.length) {
    form.append("ccUserIds", payload.ccUserIds.join(","));
  }
  for (const file of payload.files || []) {
    if (file) form.append("files", file);
  }

  const data = await fetchJson(
    `${API_BASE_URL}/api/employer/support/messages`,
    {
      method: "POST",
      headers: withAuthHeaders(accessToken, {
        Accept: "application/json",
      }),
      body: form,
    },
    "Unable to send support message."
  );

  return {
    message: mapSupportMessage(data.message || {}),
    deliveryStatus: data.delivery_status || data.deliveryStatus || "sent",
    deliveryNote: data.delivery_note || data.deliveryNote || null,
  };
}
