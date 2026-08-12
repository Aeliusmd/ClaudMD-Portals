"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DownwardSelect } from "@/components/ui/downward-select";
import { useEmployerProfile } from "@/hooks/use-employer-profile";
import { getAccessToken } from "@/lib/auth-session";
import {
  fetchAppointmentLocations,
  fetchAppointmentPatients,
  fetchAppointmentProviders,
  fetchAppointmentSlots,
  fetchAppointmentVisitTypes,
  bookAppointment,
} from "@/lib/api/employer";
import { cn } from "@/lib/utils";

const APPOINTMENT_STATUSES = [
  { value: "1", label: "Pending" },
  { value: "2", label: "Confirmed" },
];

const SCHEDULE_TYPES = [{ value: "1", label: "Once" }];

const DURATION_OPTIONS = [
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "45", label: "45 minutes" },
  { value: "60", label: "60 minutes" },
];

/** US mobile/cell numbers: digits only, exactly 10. */
const CELL_PHONE_DIGITS = 10;

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function isAllSameDigit(value) {
  const digits = digitsOnly(value);
  return digits.length > 0 && /^(\d)\1+$/.test(digits);
}

/** Names may include letters, spaces, hyphen, apostrophe, period — not digits. */
function sanitizePersonName(value) {
  return String(value || "").replace(/\d/g, "");
}

function personNameError(value, label) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return `Enter ${label}.`;
  if (/\d/.test(trimmed)) {
    return `${label.charAt(0).toUpperCase()}${label.slice(1)} cannot contain numbers.`;
  }
  return null;
}

/** US ZIP: 12345 or ZIP+4 12345-6789. */
const ZIP_PATTERN = /^\d{5}(-\d{4})?$/;

function sanitizeZipCode(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function zipCodeError(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "Enter zip.";
  if (!ZIP_PATTERN.test(trimmed)) {
    return "Enter a 5-digit ZIP or ZIP+4 (12345-6789).";
  }
  return null;
}

const GENDER_OPTIONS = [
  { value: "M", label: "Male" },
  { value: "F", label: "Female" },
  { value: "O", label: "Other" },
];

const US_STATE_OPTIONS = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC", "PR",
].map((code) => ({ value: code, label: code }));

const emptyForm = {
  patientId: "",
  accountNo: "",
  ssn: "",
  dateOfBirth: "",
  age: "",
  gender: "",
  locationId: "",
  date: "",
  resourceId: "",
  visitTypeId: "",
  startTime: "",
  duration: "15",
  statusId: "1",
  scheduleTypeId: "1",
  notes: "",
  employerName: "",
};

const emptyNewPatient = {
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  ssn: "",
  gender: "",
  accountNo: "",
  phone: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  zipCode: "",
};

function FieldError({ message }) {
  if (!message) return null;
  return <p className="mt-1 text-xs font-medium text-rose-700">{message}</p>;
}

function FieldLabel({ htmlFor, children, required, tag }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em] text-[#8B6D4F] uppercase"
    >
      <span>
        {children}
        {required ? <span className="text-rose-600"> *</span> : null}
      </span>
      {tag ? (
        <span className="rounded-full bg-secondary-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-secondary-700 normal-case">
          {tag}
        </span>
      ) : null}
    </label>
  );
}

const controlClass =
  "w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60";

function ageFromDob(isoDate) {
  if (!isoDate) return "";
  const dob = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(dob.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age >= 0 ? String(age) : "";
}

function todayIsoLocal() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toDisplayTime(hhmmss) {
  if (!hhmmss) return "—";
  const [h, m] = hhmmss.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export function CreateAppointmentModal({ open, onClose, onCreate }) {
  const titleId = useId();
  const { profile } = useEmployerProfile();
  const employerName = profile?.organization || "";

  const [form, setForm] = useState(emptyForm);
  const [newPatient, setNewPatient] = useState(() => ({ ...emptyNewPatient }));
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [useNewPatient, setUseNewPatient] = useState(false);
  const [errors, setErrors] = useState({});
  const [patientErrors, setPatientErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [bookResult, setBookResult] = useState(null);

  const [patients, setPatients] = useState([]);
  const [locations, setLocations] = useState([]);
  const [visitTypes, setVisitTypes] = useState([]);
  const [providers, setProviders] = useState([]);
  const [slots, setSlots] = useState([]);
  const [slotMeta, setSlotMeta] = useState(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const patientOptions = useMemo(
    () =>
      patients.map((patient) => ({
        value: String(patient.id),
        label: patient.name,
      })),
    [patients]
  );

  const locationOptions = useMemo(
    () =>
      locations.map((loc) => ({
        value: String(loc.id),
        label: loc.name,
      })),
    [locations]
  );

  const visitTypeOptions = useMemo(() => {
    const categoryOrder = {
      Injury: 1,
      Physical: 2,
      "Drug Screen": 3,
      "Urgent Care": 4,
      "Personal Injury": 5,
    };
    return [...visitTypes]
      .sort((a, b) => {
        const ca = categoryOrder[a.category] ?? 99;
        const cb = categoryOrder[b.category] ?? 99;
        if (ca !== cb) return ca - cb;
        return String(a.name || "").localeCompare(String(b.name || ""));
      })
      .map((vt) => ({
        value: String(vt.id),
        label: vt.label || vt.name,
      }));
  }, [visitTypes]);

  const providerOptions = useMemo(
    () =>
      providers.map((provider) => ({
        value: String(provider.resourceId),
        label: provider.name,
      })),
    [providers]
  );

  const slotOptions = useMemo(
    () =>
      slots.map((slot) => ({
        value: slot.start,
        label: slot.label,
      })),
    [slots]
  );

  const selectedProvider = providers.find(
    (item) => String(item.resourceId) === String(form.resourceId)
  );

  useEffect(() => {
    if (!open) return undefined;

    setForm({
      ...emptyForm,
      employerName,
      duration: "15",
      statusId: "1",
      scheduleTypeId: "1",
    });
    setNewPatient({ ...emptyNewPatient });
    setShowAddPatient(false);
    setUseNewPatient(false);
    setErrors({});
    setPatientErrors({});
    setSubmitError(null);
    setBookResult(null);
    setProviders([]);
    setSlots([]);
    setSlotMeta(null);

    async function loadStatic() {
      const token = getAccessToken();
      if (!token) return;
      setLoadingMeta(true);
      try {
        const [patientRows, locationRows, visitTypeRows] = await Promise.all([
          fetchAppointmentPatients(token),
          fetchAppointmentLocations(token),
          fetchAppointmentVisitTypes(token),
        ]);
        setPatients(patientRows);
        setLocations(locationRows);
        setVisitTypes(visitTypeRows);
      } catch (err) {
        setSubmitError(err?.message || "Unable to load booking options.");
      } finally {
        setLoadingMeta(false);
      }
    }

    loadStatic();

    function onKeyDown(event) {
      if (event.key === "Escape") resetAndClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !employerName) return;
    setForm((prev) =>
      prev.employerName === employerName ? prev : { ...prev, employerName }
    );
  }, [open, employerName]);

  useEffect(() => {
    if (!open || !form.locationId || !form.date) {
      setProviders([]);
      setForm((prev) =>
        prev.resourceId || prev.startTime
          ? { ...prev, resourceId: "", startTime: "" }
          : prev
      );
      setSlots([]);
      return;
    }

    let cancelled = false;
    async function loadProviders() {
      const token = getAccessToken();
      if (!token) return;
      setLoadingProviders(true);
      setSubmitError(null);
      try {
        const rows = await fetchAppointmentProviders(token, {
          locationId: Number(form.locationId),
          date: form.date,
        });
        if (cancelled) return;
        setProviders(rows);
        setForm((prev) => {
          const stillValid = rows.some(
            (row) => String(row.resourceId) === String(prev.resourceId)
          );
          if (stillValid) return prev;
          return { ...prev, resourceId: "", startTime: "" };
        });
      } catch (err) {
        if (!cancelled) {
          setProviders([]);
          setSubmitError(err?.message || "Unable to load providers.");
        }
      } finally {
        if (!cancelled) setLoadingProviders(false);
      }
    }
    loadProviders();
    return () => {
      cancelled = true;
    };
  }, [open, form.locationId, form.date]);

  useEffect(() => {
    if (!open || !form.locationId || !form.date || !form.resourceId) {
      setSlots([]);
      setSlotMeta(null);
      return;
    }

    const duration = Number(form.duration) || 0;
    if (duration <= 0) {
      setSlots([]);
      return;
    }

    let cancelled = false;
    const handle = setTimeout(async () => {
      const token = getAccessToken();
      if (!token) return;
      setLoadingSlots(true);
      try {
        const data = await fetchAppointmentSlots(token, {
          locationId: Number(form.locationId),
          resourceId: Number(form.resourceId),
          date: form.date,
          durationMinutes: duration,
          patientId:
            !useNewPatient && form.patientId
              ? Number(form.patientId)
              : undefined,
        });
        if (cancelled) return;
        setSlots(data.items);
        setSlotMeta(data);
        setForm((prev) => {
          const stillValid = data.items.some((slot) => slot.start === prev.startTime);
          if (stillValid) return prev;
          return { ...prev, startTime: "" };
        });
        setErrors((prev) => ({
          ...prev,
          startTime: undefined,
          duration: undefined,
        }));
      } catch (err) {
        if (!cancelled) {
          setSlots([]);
          setSlotMeta(null);
          setErrors((prev) => ({
            ...prev,
            startTime: err?.message || "Unable to load time slots.",
          }));
        }
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [
    open,
    form.locationId,
    form.date,
    form.resourceId,
    form.duration,
    form.patientId,
    useNewPatient,
  ]);

  function resetAndClose() {
    setForm({ ...emptyForm, employerName });
    setNewPatient({ ...emptyNewPatient });
    setShowAddPatient(false);
    setUseNewPatient(false);
    setErrors({});
    setPatientErrors({});
    setSubmitError(null);
    setBookResult(null);
    onClose();
  }

  function clearNewPatientDemographics(prev) {
    // Only wipe demographics copied from a confirmed new patient.
    // Keep an existing patient selection intact.
    if (prev.patientId) return prev;
    return {
      ...prev,
      accountNo: "",
      ssn: "",
      dateOfBirth: "",
      age: "",
      gender: "",
    };
  }

  function openAddPatientForm() {
    setNewPatient({ ...emptyNewPatient });
    setUseNewPatient(false);
    setPatientErrors({});
    setShowAddPatient(true);
    setForm((prev) => clearNewPatientDemographics(prev));
  }

  function cancelAddPatientForm() {
    setShowAddPatient(false);
    setNewPatient({ ...emptyNewPatient });
    setUseNewPatient(false);
    setPatientErrors({});
    setForm((prev) => clearNewPatientDemographics(prev));
  }

  function editNewPatient() {
    setUseNewPatient(false);
    setShowAddPatient(true);
    setPatientErrors({});
  }

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setSubmitError(null);
  }

  function setPatientField(field, value) {
    setNewPatient((prev) => ({ ...prev, [field]: value }));
    setPatientErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function applyPatient(patientId) {
    const patient = patients.find((item) => String(item.id) === String(patientId));
    setUseNewPatient(false);
    setShowAddPatient(false);
    setNewPatient({ ...emptyNewPatient });
    setPatientErrors({});
    if (!patient) {
      setField("patientId", patientId);
      return;
    }
    setForm((prev) => ({
      ...prev,
      patientId: String(patient.id),
      accountNo: patient.accountNo || "",
      ssn: patient.ssn || "",
      dateOfBirth: patient.dateOfBirth || "",
      age: ageFromDob(patient.dateOfBirth),
      gender: patient.gender || "",
      locationId: patient.locationId
        ? String(patient.locationId)
        : prev.locationId,
      employerName,
    }));
    setErrors((prev) => ({ ...prev, patientId: undefined }));
  }

  function validateNewPatient() {
    const next = {};
    const firstNameErr = personNameError(newPatient.firstName, "first name");
    if (firstNameErr) next.firstName = firstNameErr;
    const lastNameErr = personNameError(newPatient.lastName, "last name");
    if (lastNameErr) next.lastName = lastNameErr;
    if (!newPatient.dateOfBirth) {
      next.dateOfBirth = "Enter date of birth.";
    } else if (newPatient.dateOfBirth > todayIsoLocal()) {
      next.dateOfBirth = "Date of birth cannot be in the future.";
    }
    if (!newPatient.gender) next.gender = "Select gender.";
    if (!newPatient.address1.trim()) next.address1 = "Enter address 1.";
    const cityErr = personNameError(newPatient.city, "city");
    if (cityErr) next.city = cityErr;
    if (!newPatient.state) next.state = "Select state.";
    const zipErr = zipCodeError(newPatient.zipCode);
    if (zipErr) next.zipCode = zipErr;
    const phoneDigits = digitsOnly(newPatient.phone);
    if (!phoneDigits) {
      next.phone = "Enter cell phone.";
    } else if (phoneDigits.length !== CELL_PHONE_DIGITS) {
      next.phone = `Enter a ${CELL_PHONE_DIGITS}-digit cell phone number.`;
    } else if (isAllSameDigit(phoneDigits)) {
      next.phone = "Enter a valid cell phone number (not all the same digit).";
    }
    return next;
  }

  function handleConfirmNewPatient() {
    const nextErrors = validateNewPatient();
    if (Object.keys(nextErrors).length > 0) {
      setPatientErrors(nextErrors);
      return;
    }
    const fullName = `${newPatient.firstName.trim()} ${newPatient.lastName.trim()}`.trim();
    setUseNewPatient(true);
    setShowAddPatient(false);
    setForm((prev) => ({
      ...prev,
      patientId: "",
      accountNo: "",
      ssn: "",
      dateOfBirth: newPatient.dateOfBirth,
      age: ageFromDob(newPatient.dateOfBirth),
      gender: newPatient.gender,
      employerName,
    }));
    setErrors((prev) => ({ ...prev, patientId: undefined }));
    setSubmitError(null);
    // Keep display name via newPatient; patient select stays empty while useNewPatient
    void fullName;
  }

  function validate() {
    const next = {};
    if (!useNewPatient && !form.patientId) {
      next.patientId = "Select a patient or add a new one.";
    }
    if (useNewPatient) {
      const patientNext = validateNewPatient();
      Object.assign(next, patientNext);
    }
    if (!form.locationId) next.locationId = "Select a location.";
    if (!form.date) {
      next.date = "Select a date.";
    } else if (form.date < todayIsoLocal()) {
      next.date = "Appointment date must be today or a future date.";
    }
    if (!form.resourceId) next.resourceId = "Select a provider available on this date.";
    if (!form.visitTypeId) next.visitTypeId = "Select a visit type.";
    if (!form.startTime) {
      next.startTime =
        slots.length === 0
          ? "No available start times for this provider/duration."
          : "Select a start time slot.";
    } else if (!slots.some((slot) => slot.start === form.startTime)) {
      next.startTime =
        "Selected start time is no longer available for this duration. Choose another slot.";
      next.duration =
        "Duration requires neighboring free slots that are not available from this start time.";
    }
    if (!DURATION_OPTIONS.some((opt) => opt.value === String(form.duration))) {
      next.duration = "Select a duration (15, 30, 45, or 60 minutes).";
    }
    if (!form.statusId) next.statusId = "Select a status.";
    return next;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBookResult(null);
    const nextErrors = validate();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setSubmitError("Please sign in again.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await bookAppointment(token, {
        patientId: useNewPatient ? null : Number(form.patientId),
        newPatient: useNewPatient
          ? {
              firstName: newPatient.firstName.trim(),
              lastName: newPatient.lastName.trim(),
              dateOfBirth: newPatient.dateOfBirth,
              gender: newPatient.gender,
              ssn: null,
              accountNo: null,
              phone: digitsOnly(newPatient.phone),
              address1: newPatient.address1.trim(),
              address2: newPatient.address2.trim() || null,
              city: newPatient.city.trim(),
              state: newPatient.state,
              zipCode: newPatient.zipCode.trim(),
            }
          : null,
        locationId: Number(form.locationId),
        resourceId: Number(form.resourceId),
        visitTypeId: Number(form.visitTypeId),
        date: form.date,
        startTime: form.startTime,
        durationMinutes: Number(form.duration),
        appointmentStatusId: Number(form.statusId),
        scheduleTypeId: Number(form.scheduleTypeId),
        note: form.notes.trim() || null,
      });

      const patientName = useNewPatient
        ? `${newPatient.firstName.trim()} ${newPatient.lastName.trim()}`.trim()
        : patients.find((p) => String(p.id) === String(form.patientId))?.name ||
          "Patient";
      const visitTypeName =
        visitTypes.find((vt) => String(vt.id) === String(form.visitTypeId))
          ?.name || "Appointment";
      const locationName =
        locations.find((loc) => String(loc.id) === String(form.locationId))
          ?.name || "—";
      const dateObj = new Date(`${form.date}T12:00:00`);
      const displayDate = dateObj.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      setBookResult({
        ...result,
        patientWasCreated: useNewPatient,
        patientName,
        visitTypeName,
        locationName,
        providerName: selectedProvider?.name || "—",
        displayDate,
        displayTime: toDisplayTime(form.startTime),
        patientSsn: result.patientSsn || newPatient.ssn.trim() || null,
      });

      if (useNewPatient && result.patientSsn) {
        setNewPatient((prev) => ({ ...prev, ssn: result.patientSsn }));
        setForm((prev) => ({ ...prev, ssn: result.patientSsn }));
      }

      onCreate?.({
        id: result.scheduleId
          ? `appt-${result.scheduleId}`
          : `appt-${result.appointmentId || Date.now()}`,
        employee: patientName,
        employeeId: String(result.patientId || form.patientId || "new"),
        patientId: result.patientId,
        category: "Physical",
        visitType: visitTypeName,
        type: visitTypeName,
        provider: selectedProvider?.name || "—",
        clinic: locationName,
        location: locationName,
        resource: selectedProvider?.resourceName || "—",
        date: displayDate,
        time: toDisplayTime(form.startTime),
        dateValue: form.date,
        status:
          APPOINTMENT_STATUSES.find((s) => s.value === form.statusId)?.label ||
          "Pending",
        durationMinutes: result.durationMinutes,
        notes: form.notes.trim(),
        appointmentId: result.appointmentId,
        scheduleId: result.scheduleId,
      });
    } catch (err) {
      const message = err?.message || "Unable to book appointment.";
      setSubmitError(message);
      if (err?.status === 409) {
        setErrors((prev) => ({
          ...prev,
          startTime: message,
          duration:
            "Neighboring slot(s) needed for this duration are not free. Change start time or duration.",
        }));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const newPatientLabel = useNewPatient
    ? `${newPatient.firstName} ${newPatient.lastName}`.trim()
    : "";
  const patientLocked = useNewPatient || Boolean(form.patientId);
  const lockedControlClass =
    "cursor-not-allowed border-border bg-cream/40 text-muted";

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto p-4 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close create appointment dialog"
        className="fixed inset-0 cursor-pointer bg-navy/45"
        onClick={resetAndClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 my-2 flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border/70 bg-white shadow-xl sm:my-4 max-h-[min(92vh,880px)]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-ink">
            {bookResult ? "Appointment Booked" : "Create Appointment"}
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={resetAndClose}
            className="shrink-0 cursor-pointer rounded-lg p-2 text-muted transition hover:bg-cream-deep hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {submitError ? (
          <div className="shrink-0 px-5 pt-4">
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {submitError}
            </div>
          </div>
        ) : null}

        {bookResult ? (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
                <p className="font-semibold">Appointment booked successfully.</p>
                <p>
                  Reference #:{" "}
                  {bookResult.scheduleId || bookResult.appointmentId || "—"}
                </p>
                <p>
                  {bookResult.patientName} · {bookResult.visitTypeName} ·{" "}
                  {bookResult.locationName}
                </p>
                <p>
                  {bookResult.displayDate} · {bookResult.displayTime}
                  {bookResult.providerName && bookResult.providerName !== "—"
                    ? ` · ${bookResult.providerName}`
                    : ""}
                </p>
                {bookResult.patientWasCreated ? (
                  <p className="font-medium">
                    Patient created successfully
                    {bookResult.patientSsn
                      ? ` · SSN ${bookResult.patientSsn}`
                      : ""}
                    .
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-border/70 px-5 py-4">
              <Button type="button" variant="outline" onClick={resetAndClose}>
                Close
              </Button>
            </div>
          </>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
              {loadingMeta ? (
                <p className="text-sm text-muted">Loading booking options…</p>
              ) : null}

            <div>
              <FieldLabel htmlFor="appt-employer">Employer</FieldLabel>
              <input
                id="appt-employer"
                type="text"
                value={form.employerName || employerName}
                readOnly
                className={cn(controlClass, "border-border bg-cream/40")}
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <FieldLabel htmlFor="appt-patient" required>
                  Patient
                </FieldLabel>
                <button
                  type="button"
                  onClick={() => {
                    if (showAddPatient) cancelAddPatientForm();
                    else openAddPatientForm();
                  }}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary transition hover:bg-primary/10"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                  {showAddPatient ? "Cancel new patient" : "Add new patient"}
                </button>
              </div>
              {useNewPatient && !showAddPatient ? (
                <div className="rounded-lg border border-primary/30 bg-primary/5 px-3.5 py-2.5 text-sm text-ink">
                  New patient selected: <strong>{newPatientLabel}</strong>
                  <button
                    type="button"
                    className="ml-2 text-xs font-semibold text-primary underline"
                    onClick={editNewPatient}
                  >
                    Edit
                  </button>
                </div>
              ) : (
                <DownwardSelect
                  id="appt-patient"
                  value={form.patientId}
                  onChange={applyPatient}
                  options={patientOptions}
                  placeholder="Select patient (employee)..."
                  error={Boolean(errors.patientId)}
                  disabled={showAddPatient}
                />
              )}
              <FieldError message={errors.patientId} />
            </div>

            {showAddPatient ? (
              <div className="space-y-3 rounded-xl border border-border/70 bg-cream/30 p-4">
                <p className="text-sm font-medium text-ink">
                  New patient for {employerName || "this employer"}
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="new-first-name" required>
                      First Name
                    </FieldLabel>
                    <input
                      id="new-first-name"
                      type="text"
                      autoComplete="given-name"
                      value={newPatient.firstName}
                      onChange={(e) =>
                        setPatientField("firstName", sanitizePersonName(e.target.value))
                      }
                      className={cn(
                        controlClass,
                        patientErrors.firstName ? "border-rose-400" : "border-border"
                      )}
                    />
                    <FieldError message={patientErrors.firstName} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="new-last-name" required>
                      Last Name
                    </FieldLabel>
                    <input
                      id="new-last-name"
                      type="text"
                      autoComplete="family-name"
                      value={newPatient.lastName}
                      onChange={(e) =>
                        setPatientField("lastName", sanitizePersonName(e.target.value))
                      }
                      className={cn(
                        controlClass,
                        patientErrors.lastName ? "border-rose-400" : "border-border"
                      )}
                    />
                    <FieldError message={patientErrors.lastName} />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="new-dob" required>
                      Date of Birth
                    </FieldLabel>
                    <input
                      id="new-dob"
                      type="date"
                      max={todayIsoLocal()}
                      value={newPatient.dateOfBirth}
                      onChange={(e) => {
                        const value = e.target.value;
                        setPatientField("dateOfBirth", value);
                        if (value && value > todayIsoLocal()) {
                          setPatientErrors((prev) => ({
                            ...prev,
                            dateOfBirth: "Date of birth cannot be in the future.",
                          }));
                        } else {
                          setPatientErrors((prev) => ({
                            ...prev,
                            dateOfBirth: undefined,
                          }));
                        }
                      }}
                      className={cn(
                        controlClass,
                        patientErrors.dateOfBirth
                          ? "border-rose-400"
                          : "border-border"
                      )}
                    />
                    <FieldError message={patientErrors.dateOfBirth} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="new-gender" required>
                      Gender
                    </FieldLabel>
                    <DownwardSelect
                      id="new-gender"
                      value={newPatient.gender}
                      onChange={(value) => setPatientField("gender", value)}
                      options={GENDER_OPTIONS}
                      placeholder="Select gender..."
                      error={Boolean(patientErrors.gender)}
                    />
                    <FieldError message={patientErrors.gender} />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="new-ssn" tag="Auto">
                      SSN #
                    </FieldLabel>
                    <input
                      id="new-ssn"
                      type="text"
                      value=""
                      readOnly
                      disabled
                      placeholder="Generated automatically"
                      aria-readonly="true"
                      className={cn(
                        controlClass,
                        "cursor-not-allowed border-border bg-cream/40 text-muted"
                      )}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="new-account" tag="Auto">
                      Account #
                    </FieldLabel>
                    <input
                      id="new-account"
                      type="text"
                      value=""
                      readOnly
                      disabled
                      placeholder="Generated automatically"
                      aria-readonly="true"
                      className={cn(
                        controlClass,
                        "cursor-not-allowed border-border bg-cream/40 text-muted"
                      )}
                    />
                  </div>
                </div>
                <div>
                  <FieldLabel htmlFor="new-address1" required>
                    Address 1
                  </FieldLabel>
                  <input
                    id="new-address1"
                    type="text"
                    value={newPatient.address1}
                    onChange={(e) => setPatientField("address1", e.target.value)}
                    className={cn(
                      controlClass,
                      patientErrors.address1 ? "border-rose-400" : "border-border"
                    )}
                  />
                  <FieldError message={patientErrors.address1} />
                </div>
                <div>
                  <FieldLabel htmlFor="new-address2">Address 2</FieldLabel>
                  <input
                    id="new-address2"
                    type="text"
                    value={newPatient.address2}
                    onChange={(e) => setPatientField("address2", e.target.value)}
                    className={cn(controlClass, "border-border")}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <FieldLabel htmlFor="new-zip" required>
                      Zip
                    </FieldLabel>
                    <input
                      id="new-zip"
                      type="text"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      maxLength={10}
                      placeholder="12345 or 12345-6789"
                      value={newPatient.zipCode}
                      onChange={(e) =>
                        setPatientField("zipCode", sanitizeZipCode(e.target.value))
                      }
                      className={cn(
                        controlClass,
                        patientErrors.zipCode ? "border-rose-400" : "border-border"
                      )}
                    />
                    <FieldError message={patientErrors.zipCode} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="new-city" required>
                      City
                    </FieldLabel>
                    <input
                      id="new-city"
                      type="text"
                      autoComplete="address-level2"
                      value={newPatient.city}
                      onChange={(e) =>
                        setPatientField("city", sanitizePersonName(e.target.value))
                      }
                      className={cn(
                        controlClass,
                        patientErrors.city ? "border-rose-400" : "border-border"
                      )}
                    />
                    <FieldError message={patientErrors.city} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="new-state" required>
                      State
                    </FieldLabel>
                    <DownwardSelect
                      id="new-state"
                      value={newPatient.state}
                      onChange={(value) => setPatientField("state", value)}
                      options={US_STATE_OPTIONS}
                      placeholder="Select state..."
                      error={Boolean(patientErrors.state)}
                    />
                    <FieldError message={patientErrors.state} />
                  </div>
                </div>
                <div>
                  <FieldLabel htmlFor="new-phone" required>
                    Cell Phone
                  </FieldLabel>
                  <input
                    id="new-phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    maxLength={CELL_PHONE_DIGITS}
                    placeholder="10-digit number"
                    value={newPatient.phone}
                    onChange={(e) =>
                      setPatientField(
                        "phone",
                        digitsOnly(e.target.value).slice(0, CELL_PHONE_DIGITS)
                      )
                    }
                    className={cn(
                      controlClass,
                      patientErrors.phone ? "border-rose-400" : "border-border"
                    )}
                  />
                  <FieldError message={patientErrors.phone} />
                </div>
                <div>
                  <FieldLabel htmlFor="new-employer">Employer</FieldLabel>
                  <input
                    id="new-employer"
                    type="text"
                    value={employerName}
                    readOnly
                    className={cn(controlClass, "border-border bg-cream/40")}
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="button" onClick={handleConfirmNewPatient}>
                    Use this patient
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel
                  htmlFor="appt-account"
                  tag={useNewPatient ? "Auto" : undefined}
                >
                  Account #
                </FieldLabel>
                <input
                  id="appt-account"
                  type="text"
                  value={useNewPatient ? "" : form.accountNo}
                  readOnly={patientLocked}
                  disabled={patientLocked}
                  placeholder={
                    useNewPatient ? "Generated automatically" : undefined
                  }
                  onChange={
                    patientLocked
                      ? undefined
                      : (e) => setField("accountNo", e.target.value)
                  }
                  className={cn(
                    controlClass,
                    patientLocked ? lockedControlClass : "border-border"
                  )}
                />
              </div>
              <div>
                <FieldLabel
                  htmlFor="appt-ssn"
                  tag={useNewPatient ? "Auto" : undefined}
                >
                  SSN #
                </FieldLabel>
                <input
                  id="appt-ssn"
                  type="text"
                  value={useNewPatient ? "" : form.ssn}
                  readOnly={patientLocked}
                  disabled={patientLocked}
                  placeholder={
                    useNewPatient ? "Generated automatically" : undefined
                  }
                  onChange={
                    patientLocked
                      ? undefined
                      : (e) => setField("ssn", e.target.value)
                  }
                  className={cn(
                    controlClass,
                    patientLocked ? lockedControlClass : "border-border"
                  )}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <FieldLabel htmlFor="appt-dob">Date of Birth</FieldLabel>
                <input
                  id="appt-dob"
                  type="date"
                  value={form.dateOfBirth}
                  readOnly={patientLocked}
                  disabled={patientLocked}
                  onChange={
                    patientLocked
                      ? undefined
                      : (e) => {
                          const value = e.target.value;
                          setForm((prev) => ({
                            ...prev,
                            dateOfBirth: value,
                            age: ageFromDob(value),
                          }));
                        }
                  }
                  className={cn(
                    controlClass,
                    patientLocked ? lockedControlClass : "border-border"
                  )}
                />
              </div>
              <div>
                <FieldLabel htmlFor="appt-age">Age</FieldLabel>
                <input
                  id="appt-age"
                  type="text"
                  value={form.age}
                  readOnly
                  disabled
                  className={cn(controlClass, lockedControlClass)}
                />
              </div>
            </div>

            <div>
              <FieldLabel htmlFor="appt-gender">Gender</FieldLabel>
              <DownwardSelect
                id="appt-gender"
                value={form.gender}
                onChange={(value) => setField("gender", value)}
                options={GENDER_OPTIONS}
                placeholder="Select gender..."
                disabled={patientLocked}
              />
            </div>

            <div>
              <FieldLabel htmlFor="appt-location" required>
                Location
              </FieldLabel>
              <DownwardSelect
                id="appt-location"
                value={form.locationId}
                onChange={(value) => setField("locationId", value)}
                options={locationOptions}
                placeholder="Select location..."
                error={Boolean(errors.locationId)}
              />
              <FieldError message={errors.locationId} />
            </div>

            <div>
              <FieldLabel htmlFor="appt-date" required>
                Date
              </FieldLabel>
              <input
                id="appt-date"
                type="date"
                min={todayIsoLocal()}
                value={form.date}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value && value < todayIsoLocal()) {
                    setField("date", "");
                    setErrors((prev) => ({
                      ...prev,
                      date: "Appointment date must be today or a future date.",
                    }));
                    return;
                  }
                  setField("date", value);
                }}
                className={cn(
                  controlClass,
                  errors.date ? "border-rose-400" : "border-border"
                )}
              />
              <FieldError message={errors.date} />
            </div>

            <div>
              <FieldLabel htmlFor="appt-provider" required>
                Provider
              </FieldLabel>
              <DownwardSelect
                id="appt-provider"
                value={form.resourceId}
                onChange={(value) => setField("resourceId", value)}
                options={providerOptions}
                placeholder={
                  !form.locationId || !form.date
                    ? "Select location and date first..."
                    : loadingProviders
                      ? "Loading providers..."
                      : providerOptions.length
                        ? "Select provider..."
                        : "No providers available this date"
                }
                error={Boolean(errors.resourceId)}
                disabled={!form.locationId || !form.date || loadingProviders}
              />
              <FieldError message={errors.resourceId} />
              {selectedProvider ? (
                <p className="mt-1 text-xs text-muted">
                  Slot size: {selectedProvider.timeSlotMinutes} min · Capacity:{" "}
                  {selectedProvider.patientsPerSlot}/slot
                  {selectedProvider.shifts?.[0]
                    ? ` · Hours: ${selectedProvider.shifts
                        .map((s) => `${toDisplayTime(s.start)}–${toDisplayTime(s.end)}`)
                        .join(", ")}`
                    : null}
                </p>
              ) : null}
            </div>

            <div>
              <FieldLabel htmlFor="appt-visit-type" required>
                Visit Type
              </FieldLabel>
              <DownwardSelect
                id="appt-visit-type"
                value={form.visitTypeId}
                onChange={(value) => setField("visitTypeId", value)}
                options={visitTypeOptions}
                placeholder="Select visit type..."
                searchPlaceholder="Search visit type..."
                searchable
                error={Boolean(errors.visitTypeId)}
              />
              <FieldError message={errors.visitTypeId} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="appt-duration" required>
                  Duration
                </FieldLabel>
                <DownwardSelect
                  id="appt-duration"
                  value={form.duration}
                  onChange={(value) => setField("duration", value)}
                  options={DURATION_OPTIONS}
                  placeholder="Select duration..."
                  error={Boolean(errors.duration)}
                  disabled={!form.resourceId}
                />
                <FieldError message={errors.duration} />
                {slotMeta ? (
                  <p className="mt-1 text-xs text-muted">
                    Uses {slotMeta.slotsNeeded} provider slot
                    {slotMeta.slotsNeeded === 1 ? "" : "s"} (
                    {slotMeta.timeSlotMinutes} min each).
                  </p>
                ) : null}
              </div>
              <div>
                <FieldLabel htmlFor="appt-start" required>
                  Start Time
                </FieldLabel>
                <DownwardSelect
                  id="appt-start"
                  value={form.startTime}
                  onChange={(value) => setField("startTime", value)}
                  options={slotOptions}
                  placeholder={
                    !form.resourceId
                      ? "Select provider first..."
                      : loadingSlots
                        ? "Calculating slots..."
                        : slotOptions.length
                          ? "Select start time..."
                          : "No free slots for this duration"
                  }
                  error={Boolean(errors.startTime)}
                  disabled={!form.resourceId || loadingSlots}
                />
                <FieldError message={errors.startTime} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="appt-status" required>
                  Status
                </FieldLabel>
                <DownwardSelect
                  id="appt-status"
                  value={form.statusId}
                  onChange={(value) => setField("statusId", value)}
                  options={APPOINTMENT_STATUSES}
                  placeholder="Select status..."
                />
              </div>
              <div>
                <FieldLabel htmlFor="appt-schedule-type">Schedule Type</FieldLabel>
                <DownwardSelect
                  id="appt-schedule-type"
                  value={form.scheduleTypeId}
                  onChange={(value) => setField("scheduleTypeId", value)}
                  options={SCHEDULE_TYPES}
                  placeholder="Select schedule type..."
                />
              </div>
            </div>

            <div>
              <FieldLabel htmlFor="appt-notes">Note</FieldLabel>
              <textarea
                id="appt-notes"
                rows={3}
                value={form.notes}
                onChange={(e) => setField("notes", e.target.value)}
                placeholder="Any special instructions..."
                className={cn(controlClass, "resize-y border-border")}
              />
            </div>
            </div>

            <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border/70 px-5 py-4">
              <Button type="button" variant="outline" onClick={resetAndClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || loadingMeta}>
                {submitting ? "Booking…" : "Book Appointment"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
