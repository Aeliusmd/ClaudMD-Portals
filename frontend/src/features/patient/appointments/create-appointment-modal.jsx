"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DownwardSelect } from "@/components/ui/downward-select";
import {
  bookPatientAppointment,
  fetchPatientAppointmentLocations,
  fetchPatientAppointmentProviders,
  fetchPatientAppointmentSlots,
  fetchPatientAppointmentVisitTypes,
} from "@/lib/api/patient";
import { getAccessToken } from "@/lib/auth-session";
import { toDisplayDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

const DURATION_OPTIONS = [
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "45", label: "45 minutes" },
  { value: "60", label: "60 minutes" },
];

const emptyForm = {
  locationId: "",
  date: "",
  resourceId: "",
  visitTypeId: "",
  duration: "15",
  startTime: "",
  notes: "",
};

function FieldLabel({ htmlFor, children, required }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-[11px] font-semibold tracking-[0.08em] text-[#8B6D4F] uppercase"
    >
      {children}
      {required ? <span className="text-rose-600"> *</span> : null}
    </label>
  );
}

function FieldError({ message }) {
  if (!message) return null;
  return <p className="mt-1 text-xs font-medium text-rose-700">{message}</p>;
}

const fieldClass =
  "w-full rounded-xl border border-[#e6ded5] bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-[#b0a89e] focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60";

function todayIsoLocal() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toDisplayTime(hhmmss) {
  if (!hhmmss) return "—";
  const [h, m] = String(hhmmss).split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export function CreatePatientAppointmentModal({ open, onClose, onCreate }) {
  const titleId = useId();
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [locations, setLocations] = useState([]);
  const [visitTypes, setVisitTypes] = useState([]);
  const [providers, setProviders] = useState([]);
  const [slots, setSlots] = useState([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const locationOptions = useMemo(
    () =>
      locations.map((loc) => ({
        value: String(loc.id),
        label: loc.name,
      })),
    [locations]
  );

  const visitTypeOptions = useMemo(
    () =>
      visitTypes.map((vt) => ({
        value: String(vt.id),
        label: vt.label || vt.name,
      })),
    [visitTypes]
  );

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
  const selectedVisitType = visitTypes.find(
    (item) => String(item.id) === String(form.visitTypeId)
  );
  const selectedLocation = locations.find(
    (item) => String(item.id) === String(form.locationId)
  );

  useEffect(() => {
    if (!open) return undefined;

    setForm(emptyForm);
    setErrors({});
    setSubmitError(null);
    setProviders([]);
    setSlots([]);

    async function loadStatic() {
      const token = getAccessToken();
      if (!token) return;
      setLoadingMeta(true);
      try {
        const [locationRows, visitTypeRows] = await Promise.all([
          fetchPatientAppointmentLocations(token),
          fetchPatientAppointmentVisitTypes(token),
        ]);
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
        const rows = await fetchPatientAppointmentProviders(token, {
          locationId: form.locationId,
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
        if (cancelled) return;
        setProviders([]);
        setSlots([]);
        setSubmitError(err?.message || "Unable to load providers.");
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
    if (!open || !form.locationId || !form.resourceId || !form.date) {
      setSlots([]);
      setForm((prev) => (prev.startTime ? { ...prev, startTime: "" } : prev));
      return;
    }

    let cancelled = false;
    async function loadSlots() {
      const token = getAccessToken();
      if (!token) return;
      setLoadingSlots(true);
      setSubmitError(null);
      try {
        const data = await fetchPatientAppointmentSlots(token, {
          locationId: form.locationId,
          resourceId: form.resourceId,
          date: form.date,
          durationMinutes: Number(form.duration) || 15,
        });
        if (cancelled) return;
        const items = data.items || [];
        setSlots(items);
        setForm((prev) => {
          const stillValid = items.some((slot) => slot.start === prev.startTime);
          if (stillValid) return prev;
          return { ...prev, startTime: "" };
        });
      } catch (err) {
        if (cancelled) return;
        setSlots([]);
        setSubmitError(err?.message || "Unable to load time slots.");
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    }

    loadSlots();
    return () => {
      cancelled = true;
    };
  }, [open, form.locationId, form.resourceId, form.date, form.duration]);

  function resetAndClose() {
    setForm(emptyForm);
    setErrors({});
    setSubmitError(null);
    setProviders([]);
    setSlots([]);
    onClose();
  }

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function validate() {
    const next = {};
    if (!form.locationId) next.locationId = "Location is required.";
    if (!form.date) next.date = "Date is required.";
    if (!form.resourceId) next.resourceId = "Provider is required.";
    if (!form.visitTypeId) next.visitTypeId = "Visit type is required.";
    if (!form.duration) next.duration = "Duration is required.";
    if (!form.startTime) next.startTime = "Time slot is required.";
    return next;
  }

  const isComplete =
    Boolean(form.locationId) &&
    Boolean(form.date) &&
    Boolean(form.resourceId) &&
    Boolean(form.visitTypeId) &&
    Boolean(form.duration) &&
    Boolean(form.startTime);

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const token = getAccessToken();
    if (!token) {
      setSubmitError("Please sign in again to book an appointment.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await bookPatientAppointment(token, {
        locationId: Number(form.locationId),
        resourceId: Number(form.resourceId),
        visitTypeId: Number(form.visitTypeId),
        date: form.date,
        startTime: form.startTime,
        durationMinutes: Number(form.duration) || 15,
        note: form.notes.trim() || null,
      });

      onCreate?.({
        id: result.scheduleId
          ? `appt-${result.scheduleId}`
          : `apt-${form.date}-${form.startTime}`,
        doctor: selectedProvider?.name || "—",
        specialty:
          selectedVisitType?.categoryId === 4
            ? "Personal Injury"
            : selectedVisitType?.categoryId === 3
              ? "Urgent Care"
              : selectedVisitType?.name || "Appointment",
        type: selectedVisitType?.name || "Appointment",
        location: selectedLocation?.name || null,
        date: toDisplayDate(form.date),
        time: toDisplayTime(form.startTime),
        notes: form.notes.trim(),
        status: "Pending",
      });
      resetAndClose();
    } catch (err) {
      setSubmitError(err?.message || "Unable to book appointment.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close create appointment backdrop"
        className="fixed inset-0 cursor-pointer bg-navy/45"
        onClick={resetAndClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 my-4 flex max-h-[min(92dvh,50rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#ece7df] bg-white shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#f0ebe3] px-5 py-4 sm:px-6">
          <div>
            <h2
              id={titleId}
              className="text-lg font-semibold text-ink sm:text-xl"
            >
              Create Appointment
            </h2>
            <p className="mt-1 text-xs text-muted">
              Urgent Care and Personal Injury visit types only
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={resetAndClose}
            className="cursor-pointer rounded-lg p-1.5 text-muted transition hover:bg-cream-deep hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
            {submitError ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {submitError}
              </p>
            ) : null}

            <div>
              <FieldLabel htmlFor="patient-appt-location" required>
                Location
              </FieldLabel>
              <DownwardSelect
                id="patient-appt-location"
                value={form.locationId}
                onChange={(value) => updateField("locationId", value)}
                options={locationOptions}
                placeholder={
                  loadingMeta ? "Loading locations..." : "Select location..."
                }
                disabled={loadingMeta}
                error={Boolean(errors.locationId)}
              />
              <FieldError message={errors.locationId} />
            </div>

            <div>
              <FieldLabel htmlFor="patient-appt-date" required>
                Date
              </FieldLabel>
              <input
                id="patient-appt-date"
                type="date"
                min={todayIsoLocal()}
                value={form.date}
                onChange={(event) => updateField("date", event.target.value)}
                disabled={!form.locationId}
                className={cn(
                  fieldClass,
                  errors.date && "border-rose-300",
                  !form.locationId && "opacity-60"
                )}
              />
              <FieldError message={errors.date} />
            </div>

            <div>
              <FieldLabel htmlFor="patient-appt-provider" required>
                Provider
              </FieldLabel>
              <DownwardSelect
                id="patient-appt-provider"
                value={form.resourceId}
                onChange={(value) => updateField("resourceId", value)}
                options={providerOptions}
                placeholder={
                  !form.locationId || !form.date
                    ? "Select location and date first..."
                    : loadingProviders
                      ? "Loading providers..."
                      : providerOptions.length
                        ? "Select provider..."
                        : "No providers available"
                }
                disabled={
                  !form.locationId || !form.date || loadingProviders
                }
                error={Boolean(errors.resourceId)}
              />
              <FieldError message={errors.resourceId} />
            </div>

            <div>
              <FieldLabel htmlFor="patient-appt-type" required>
                Visit type
              </FieldLabel>
              <DownwardSelect
                id="patient-appt-type"
                value={form.visitTypeId}
                onChange={(value) => updateField("visitTypeId", value)}
                options={visitTypeOptions}
                placeholder={
                  loadingMeta
                    ? "Loading visit types..."
                    : "Select Urgent Care or Personal Injury..."
                }
                disabled={loadingMeta}
                error={Boolean(errors.visitTypeId)}
              />
              <FieldError message={errors.visitTypeId} />
            </div>

            <div>
              <FieldLabel htmlFor="patient-appt-duration" required>
                Duration
              </FieldLabel>
              <DownwardSelect
                id="patient-appt-duration"
                value={form.duration}
                onChange={(value) => updateField("duration", value)}
                options={DURATION_OPTIONS}
                placeholder="Select duration..."
                disabled={!form.resourceId}
                error={Boolean(errors.duration)}
              />
              <FieldError message={errors.duration} />
            </div>

            <div>
              <FieldLabel htmlFor="patient-appt-slot" required>
                Time slot
              </FieldLabel>
              <DownwardSelect
                id="patient-appt-slot"
                value={form.startTime}
                onChange={(value) => updateField("startTime", value)}
                options={slotOptions}
                placeholder={
                  !form.resourceId
                    ? "Select provider first..."
                    : loadingSlots
                      ? "Loading slots..."
                      : slotOptions.length
                        ? "Select available time..."
                        : "No slots available"
                }
                disabled={!form.resourceId || loadingSlots}
                error={Boolean(errors.startTime)}
              />
              <FieldError message={errors.startTime} />
            </div>

            <div>
              <FieldLabel htmlFor="patient-appt-notes">
                Notes (Optional)
              </FieldLabel>
              <textarea
                id="patient-appt-notes"
                rows={3}
                value={form.notes}
                onChange={(event) => updateField("notes", event.target.value)}
                placeholder="Any special instructions..."
                className={cn(fieldClass, "min-h-[5.5rem] resize-y")}
              />
            </div>
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[#f0ebe3] px-5 py-4 sm:flex-row sm:justify-end sm:gap-3 sm:px-6">
            <Button
              type="button"
              variant="outline"
              onClick={resetAndClose}
              className="border-[#e6ded5]"
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isComplete || submitting}>
              {submitting ? "Booking…" : "Create Appointment"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
