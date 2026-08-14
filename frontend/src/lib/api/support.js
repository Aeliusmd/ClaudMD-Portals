import { fetchJson } from "@/lib/api/http";
import { withAuthHeaders } from "@/lib/auth-session";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

function mapSupportUser(user) {
  if (!user) return null;
  return {
    userId: user.user_id ?? user.userId ?? null,
    fullName: user.full_name || user.fullName || "",
    email: user.email || null,
    displayLabel:
      user.display_label ||
      user.displayLabel ||
      user.email ||
      user.full_name ||
      "",
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
    ccUsers: (row.cc_users || row.ccUsers || [])
      .map(mapSupportUser)
      .filter(Boolean),
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

/**
 * Shared Support API client for employer / insurance / patient portals.
 * @param {string} apiPrefix e.g. "/api/employer"
 */
export function createSupportApi(apiPrefix) {
  const base = String(apiPrefix || "").replace(/\/$/, "");

  async function portalFetch(path, accessToken, fallbackMessage) {
    return fetchJson(
      `${API_BASE_URL}${base}${path}`,
      {
        method: "GET",
        headers: withAuthHeaders(accessToken, {
          Accept: "application/json",
        }),
      },
      fallbackMessage
    );
  }

  return {
    async fetchClinic(accessToken) {
      const data = await portalFetch(
        "/support/clinic",
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
        insuranceId: data.insurance_id ?? null,
        patientId: data.patient_id ?? null,
        fromEmail: data.from_email || null,
        fromName: data.from_name || null,
        fromUserId: data.from_user_id ?? data.fromUserId ?? null,
      };
    },

    async fetchRecipients(accessToken, { search = "" } = {}) {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const suffix = params.toString() ? `?${params}` : "";
      const data = await portalFetch(
        `/support/recipients${suffix}`,
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
    },

    async fetchMessages(accessToken, { page = 1, pageSize = 10 } = {}) {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize || 10));
      const data = await portalFetch(
        `/support/messages?${params}`,
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
    },

    async fetchMessage(accessToken, messageId) {
      const data = await portalFetch(
        `/support/messages/${encodeURIComponent(messageId)}`,
        accessToken,
        "Unable to load support message."
      );
      return mapSupportMessage(data);
    },

    async sendMessage(accessToken, payload) {
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
        `${API_BASE_URL}${base}/support/messages`,
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
    },
  };
}
