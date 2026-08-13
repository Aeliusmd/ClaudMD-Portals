import { fetchJson } from "@/lib/api/http";
import {
  patientSharedDocumentFileUrl,
  patientVisitDocumentFileUrl,
} from "@/lib/documents";
import { formatDateMMDDYY, formatDateMMDDYYYY } from "@/lib/dates";
import { mapPreviousVisitVersions } from "@/lib/visit-document-map";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

async function patientFetch(
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

function mapPatientProfile(data) {
  let firstName = data.first_name || "";
  let lastName = data.last_name || "";
  if (!firstName && !lastName && data.full_name) {
    const parts = String(data.full_name).trim().split(/\s+/).filter(Boolean);
    firstName = parts[0] || "";
    lastName = parts.slice(1).join(" ");
  }
  return {
    fullName:
      [firstName, lastName].filter(Boolean).join(" ") || data.full_name || "",
    firstName,
    lastName,
    dateOfBirth: data.date_of_birth || "",
    email: data.email || "",
    phone: data.phone || "",
    address: data.address || "",
    patientId: data.patient_id,
    userId: data.user_id,
    loginId: data.login_id,
    typeId: data.type_id,
    typeLabel: data.type_label,
    role: data.type_label || null,
  };
}

export async function fetchPatientProfile(accessToken) {
  const data = await patientFetch(
    "/api/patient/me",
    accessToken,
    "Unable to load patient profile."
  );
  return mapPatientProfile(data);
}

export async function updatePatientProfile(accessToken, payload) {
  const data = await patientFetch(
    "/api/patient/me",
    accessToken,
    "Unable to update patient profile.",
    {
      method: "PATCH",
      body: {
        full_name: payload.fullName,
        date_of_birth: payload.dateOfBirth || null,
        email: payload.email,
        phone: payload.phone || null,
        address: payload.address || null,
      },
    }
  );
  return mapPatientProfile(data);
}

function formatDisplayDate(isoOrDisplay) {
  return formatDateMMDDYY(isoOrDisplay);
}

function formatDobDisplay(isoOrDisplay) {
  return formatDateMMDDYYYY(isoOrDisplay);
}

export async function fetchPatientMyInformation(accessToken) {
  const data = await patientFetch(
    "/api/patient/me/information",
    accessToken,
    "Unable to load my information."
  );

  const insurance = data.insurance || {};
  const employer = data.employer || {};

  return {
    patientId: data.patient_id,
    fullName: data.full_name || "",
    dateOfBirth: formatDobDisplay(data.date_of_birth),
    email: data.email || "",
    phone: data.phone || "",
    address: data.address || "",
    emergencyContact: data.emergency_contact || "",
    insurance: {
      carrier: insurance.carrier || "",
      policyNumber: insurance.policy_number || "",
      groupNumber: insurance.group_number || "",
      planType: insurance.plan_type || "",
      effectiveDate: formatDisplayDate(insurance.effective_date),
    },
    employer: {
      name: employer.name || "",
      department: employer.department || "",
    },
  };
}

export async function fetchPatientNotifications(
  accessToken,
  { page = 1, pageSize = 10 } = {}
) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  const data = await patientFetch(
    `/api/patient/notifications?${params.toString()}`,
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
    patientId: data.patient_id,
  };
}

export async function markPatientNotificationsRead(accessToken) {
  const data = await patientFetch(
    "/api/patient/notifications/mark-read",
    accessToken,
    "Unable to mark notifications as read.",
    { method: "POST" }
  );

  return {
    updatedCount: data.updated_count ?? 0,
    patientId: data.patient_id,
  };
}

export async function fetchPatientDashboardSummary(accessToken) {
  const data = await patientFetch(
    "/api/patient/dashboard/summary",
    accessToken,
    "Unable to load patient dashboard summary."
  );

  return {
    urgentCare: data.urgent_care ?? data.urgentCare ?? 0,
    personalInjury: data.personal_injury ?? data.personalInjury ?? 0,
    physicals: data.physicals ?? 0,
    injury: data.injury ?? 0,
    appointments: data.appointments ?? 0,
    unreadReports: data.unread_reports ?? data.unreadReports ?? 0,
    days: data.days ?? 30,
    patientId: data.patient_id ?? data.patientId ?? null,
  };
}

/**
 * Live visit rows for a KPI category tab (urgentCare, personalInjury, physicals, injury).
 */
export async function fetchPatientDashboardVisits(
  accessToken,
  { category, fromDate, toDate, search } = {}
) {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (fromDate) params.set("fromDate", fromDate);
  if (toDate) params.set("toDate", toDate);
  if (search?.trim()) params.set("search", search.trim());

  const data = await patientFetch(
    `/api/patient/dashboard/visits?${params.toString()}`,
    accessToken,
    "Unable to load patient visits."
  );

  const items = (data.items || []).map((row) => ({
    id: String(row.id ?? row.check_in_id ?? row.checkInId ?? ""),
    checkInId: row.check_in_id ?? row.checkInId ?? null,
    category: row.category || "",
    provider: row.provider || "—",
    location: row.location || "—",
    date: formatDateMMDDYY(row.date) || row.date || null,
    dateValue: row.date_value ?? row.dateValue ?? null,
    workStatus: row.work_status ?? row.workStatus ?? "—",
    documentCount: row.document_count ?? row.documentCount ?? 0,
    visitType: row.visit_type ?? row.visitType ?? null,
  }));

  return {
    items,
    total: data.total ?? items.length,
    category: data.category || category || null,
    fromDate: data.from_date ?? data.fromDate ?? fromDate ?? null,
    toDate: data.to_date ?? data.toDate ?? toDate ?? null,
    patientId: data.patient_id ?? data.patientId ?? null,
  };
}

/**
 * Selected visit detail for the logged-in patient (demographics, docs, other visits).
 */
export async function fetchPatientVisitDetail(accessToken, checkInId) {
  const data = await patientFetch(
    `/api/patient/visits/${encodeURIComponent(checkInId)}`,
    accessToken,
    "Unable to load visit details."
  );

  const patientId = data.patient_id ?? data.patientId;
  const visitCheckInId = data.check_in_id ?? data.checkInId ?? checkInId;
  const patient = data.patient || {};

  return {
    id: String(data.id ?? visitCheckInId),
    checkInId: visitCheckInId,
    patientId,
    category: data.category || "Other",
    provider: data.provider || "—",
    location: data.location || "—",
    date: formatDateMMDDYY(data.date) || data.date || null,
    dateValue: data.date_value ?? data.dateValue ?? null,
    status: data.status || "Completed",
    workStatus: data.work_status ?? data.workStatus ?? "—",
    restrictions: data.restrictions || "—",
    followUp: data.follow_up ?? data.followUp ?? "—",
    specialInstructions:
      data.special_instructions ?? data.specialInstructions ?? null,
    visitType: data.visit_type ?? data.visitType ?? null,
    showEmployer: data.show_employer ?? data.showEmployer ?? true,
    showInsurance: data.show_insurance ?? data.showInsurance ?? true,
    showWorkStatus: data.show_work_status ?? data.showWorkStatus ?? true,
    patient: {
      fullName: patient.full_name ?? patient.fullName ?? "Patient",
      accountNo:
        patient.account_no != null
          ? String(patient.account_no)
          : patient.accountNo != null
            ? String(patient.accountNo)
            : null,
      gender: patient.gender || null,
      dateOfBirth: patient.date_of_birth ?? patient.dateOfBirth ?? null,
      phone: patient.phone || null,
      email: patient.email || null,
      address: patient.address || null,
      addressLines: Array.isArray(patient.address_lines)
        ? patient.address_lines
        : Array.isArray(patient.addressLines)
          ? patient.addressLines
          : [],
      insurance: {
        carrier:
          patient.insurance_name ?? patient.insuranceName ?? null,
        planType:
          patient.insurance_plan ?? patient.insurancePlan ?? null,
      },
      employer: {
        name: patient.employer_name ?? patient.employerName ?? null,
        department:
          patient.employer_department ?? patient.employerDepartment ?? null,
      },
    },
    documents: (data.documents || [])
      .map((doc) => {
        const id = doc.id;
        const apiFileUrl = patientVisitDocumentFileUrl(visitCheckInId, id);
        if (!apiFileUrl) return null;
        return {
          id: String(id),
          documentId: String(id),
          checkInId: doc.check_in_id ?? doc.checkInId ?? visitCheckInId,
          reportId: doc.report_id ?? doc.reportId ?? null,
          title: doc.report_name || doc.reportName || doc.name || "Document",
          name: doc.name || doc.report_name || doc.reportName || "Document",
          type: doc.report_name || doc.reportName || "Document",
          previewBadge: doc.preview_badge ?? doc.previewBadge ?? "DOC",
          previewLabel: doc.preview_label ?? doc.previewLabel ?? "DOC",
          url: apiFileUrl,
          visitDate: formatDateMMDDYY(data.date) || data.date || null,
          publishedAt: doc.published_at ?? doc.publishedAt ?? null,
          versionTag: doc.version_tag ?? doc.versionTag ?? null,
          previousVersions: mapPreviousVisitVersions(
            doc.previous_versions ?? doc.previousVersions,
            (previousId) => patientVisitDocumentFileUrl(visitCheckInId, previousId)
          ),
        };
      })
      .filter(Boolean),
    otherVisits: (data.other_visits || data.otherVisits || []).map((row) => ({
      id: String(row.id ?? row.check_in_id ?? row.checkInId),
      checkInId: row.check_in_id ?? row.checkInId,
      category: row.category || "Other",
      provider: row.provider || "—",
      location: row.location || "—",
      date: formatDateMMDDYY(row.date) || row.date || null,
      dateValue: row.date_value ?? row.dateValue ?? null,
      status: row.status || null,
    })),
  };
}

/**
 * Upcoming AppointmentSchedules for the logged-in patient.
 */
export async function fetchPatientUpcomingAppointments(
  accessToken,
  { page = 1, pageSize = 10 } = {}
) {
  return fetchPatientAppointments(accessToken, {
    scope: "upcoming",
    page,
    pageSize,
  });
}

/**
 * Patient appointments table (all | upcoming | completed).
 */
export async function fetchPatientAppointments(
  accessToken,
  { scope = "all", page = 1, pageSize = 10 } = {}
) {
  const params = new URLSearchParams();
  params.set("scope", scope || "all");
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));

  const data = await patientFetch(
    `/api/patient/appointments?${params.toString()}`,
    accessToken,
    "Unable to load appointments."
  );

  return {
    items: (data.items || []).map((row) => ({
      id: row.id,
      scheduleId: row.schedule_id ?? row.scheduleId,
      appointmentId: row.appointment_id ?? row.appointmentId,
      doctor: row.doctor || "—",
      specialty: row.specialty || row.category || "Appointment",
      type: row.type || "Appointment",
      category: row.category || null,
      location: row.location || "—",
      date: formatDateMMDDYY(row.date) || row.date || null,
      dateValue: row.date_value ?? row.dateValue ?? null,
      time: row.time || "—",
      status: row.status || "Scheduled",
    })),
    total: data.total ?? 0,
    page: data.page ?? page,
    pageSize: data.page_size ?? data.pageSize ?? pageSize,
    totalPages: data.total_pages ?? data.totalPages ?? 1,
    patientId: data.patient_id ?? data.patientId ?? null,
  };
}

export async function fetchPatientAppointmentLocations(accessToken) {
  const data = await patientFetch(
    "/api/patient/appointments/locations",
    accessToken,
    "Unable to load locations."
  );
  return (data || []).map((row) => ({
    id: row.id,
    name: row.short_name
      ? `${row.name} (${row.short_name})`
      : row.name,
    shortName: row.short_name ?? row.shortName ?? null,
  }));
}

export async function fetchPatientAppointmentVisitTypes(accessToken) {
  const data = await patientFetch(
    "/api/patient/appointments/visit-types",
    accessToken,
    "Unable to load visit types."
  );
  return (data || []).map((row) => {
    const categoryId = row.category_id ?? row.categoryId ?? null;
    const categoryLabel =
      categoryId === 3
        ? "Urgent Care"
        : categoryId === 4
          ? "Personal Injury"
          : null;
    const name = row.name || "Visit type";
    return {
      id: row.id,
      code: row.code,
      name,
      categoryId,
      label: categoryLabel
        ? `${name} (${categoryLabel})`
        : row.code
          ? `${name} (${row.code})`
          : name,
    };
  });
}

export async function fetchPatientAppointmentProviders(
  accessToken,
  { locationId, date }
) {
  const params = new URLSearchParams();
  params.set("locationId", String(locationId));
  params.set("date", date);
  const data = await patientFetch(
    `/api/patient/appointments/providers?${params.toString()}`,
    accessToken,
    "Unable to load providers for this date."
  );
  return (data || []).map((row) => ({
    resourceId: row.resource_id ?? row.resourceId,
    providerId: row.provider_id ?? row.providerId,
    name: row.name,
    resourceName: row.resource_name ?? row.resourceName,
    providerName: row.provider_name ?? row.providerName,
    locationId: row.location_id ?? row.locationId,
    timeSlotMinutes: row.time_slot_minutes ?? row.timeSlotMinutes ?? 15,
    patientsPerSlot: row.patients_per_slot ?? row.patientsPerSlot ?? 1,
    shifts: row.shifts || [],
  }));
}

export async function fetchPatientAppointmentSlots(
  accessToken,
  { locationId, resourceId, date, durationMinutes }
) {
  const params = new URLSearchParams();
  params.set("locationId", String(locationId));
  params.set("resourceId", String(resourceId));
  params.set("date", date);
  params.set("durationMinutes", String(durationMinutes || 15));
  const data = await patientFetch(
    `/api/patient/appointments/slots?${params.toString()}`,
    accessToken,
    "Unable to load available time slots."
  );
  return {
    date: data.date,
    locationId: data.location_id ?? data.locationId,
    resourceId: data.resource_id ?? data.resourceId,
    durationMinutes: data.duration_minutes ?? data.durationMinutes,
    timeSlotMinutes: data.time_slot_minutes ?? data.timeSlotMinutes,
    patientsPerSlot: data.patients_per_slot ?? data.patientsPerSlot,
    slotsNeeded: data.slots_needed ?? data.slotsNeeded,
    items: (data.items || []).map((row) => ({
      start: row.start,
      end: row.end,
      label: row.label,
      slotsUsed: row.slots_used ?? row.slotsUsed,
    })),
  };
}

export async function bookPatientAppointment(accessToken, payload) {
  const data = await patientFetch(
    "/api/patient/appointments/book",
    accessToken,
    "Unable to book appointment.",
    {
      method: "POST",
      body: {
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
    executed: data.executed ?? true,
    message: data.message || "Appointment booked successfully.",
    patientId: data.patient_id ?? data.patientId ?? null,
    appointmentId: data.appointment_id ?? data.appointmentId ?? null,
    scheduleId: data.schedule_id ?? data.scheduleId ?? null,
    locationId: data.location_id ?? data.locationId ?? null,
    resourceId: data.resource_id ?? data.resourceId ?? null,
    date: formatDateMMDDYY(data.date) || data.date || null,
    startTime: data.start_time ?? data.startTime ?? null,
    endTime: data.end_time ?? data.endTime ?? null,
    durationMinutes: data.duration_minutes ?? data.durationMinutes ?? null,
  };
}

export async function fetchPatientSharedDocumentBySharedId(
  accessToken,
  sharedId
) {
  const data = await patientFetch(
    `/api/patient/shared-documents/by-shared-id/${encodeURIComponent(sharedId)}`,
    accessToken,
    "Unable to load shared document."
  );

  const fileUrl = patientSharedDocumentFileUrl(data.shared_id);
  const employee = data.employee || {};

  return {
    sharedId: data.shared_id,
    documentId: data.document_id,
    documentType: data.document_type || data.report_title || "Shared document",
    reportTitle: data.report_title || data.document_type || "Shared document",
    fileName: data.file_name || null,
    visitDate: formatDateMMDDYY(data.visit_date) || data.visit_date || null,
    visitLabel: data.visit_label || "Visit",
    employee: {
      patientId: employee.patient_id ?? null,
      name: employee.name || "Patient",
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
      provider: null,
      url: fileUrl,
    },
  };
}
