import { patientVisitDocumentFileUrl } from "@/lib/documents";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

async function patientFetch(path, accessToken, fallbackMessage) {
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
    error.detail = detail;
    throw error;
  }

  return data;
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
