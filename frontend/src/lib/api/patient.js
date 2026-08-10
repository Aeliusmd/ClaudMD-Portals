import { fetchJson } from "@/lib/api/http";
import { patientVisitDocumentFileUrl } from "@/lib/documents";

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
  return {
    fullName: data.full_name || "",
    firstName: data.first_name || "",
    lastName: data.last_name || "",
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
  if (!isoOrDisplay) return "";
  const text = String(isoOrDisplay).trim();
  if (/^[A-Za-z]{3}\s+\d{1,2},\s+\d{4}$/.test(text)) return text;
  const iso = text.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return text;
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
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
    dateOfBirth: formatDisplayDate(data.date_of_birth),
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
    date: row.date || null,
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
    date: data.date || null,
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
          visitDate: data.date || null,
        };
      })
      .filter(Boolean),
    otherVisits: (data.other_visits || data.otherVisits || []).map((row) => ({
      id: String(row.id ?? row.check_in_id ?? row.checkInId),
      checkInId: row.check_in_id ?? row.checkInId,
      category: row.category || "Other",
      provider: row.provider || "—",
      location: row.location || "—",
      date: row.date || null,
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
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));

  const data = await patientFetch(
    `/api/patient/appointments/upcoming?${params.toString()}`,
    accessToken,
    "Unable to load upcoming appointments."
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
      location: row.location || null,
      date: row.date || null,
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
