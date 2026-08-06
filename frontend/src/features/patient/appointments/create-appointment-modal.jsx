"use client";

import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DownwardSelect } from "@/components/ui/downward-select";
import {
  appointmentLocations,
  appointmentProviders,
  appointmentTypes,
} from "@/data/appointments";
import { toDisplayDate, toDisplayTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

const emptyForm = {
  date: "",
  time: "",
  type: "Follow-up",
  provider: "",
  location: "",
  notes: "",
};

const fieldClass =
  "w-full rounded-xl border border-[#e6ded5] bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-[#b0a89e] focus:border-primary focus:ring-2 focus:ring-primary/15";

const typeOptions = appointmentTypes.map((type) => ({
  value: type,
  label: type,
}));

const providerOptions = appointmentProviders.map((provider) => ({
  value: provider.name,
  label: `${provider.name} — ${provider.specialty}`,
}));

const locationOptions = appointmentLocations.map((location) => ({
  value: location,
  label: location,
}));

function FieldLabel({ htmlFor, children }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-[11px] font-semibold tracking-[0.08em] text-[#8B6D4F] uppercase"
    >
      {children}
    </label>
  );
}

function FieldError({ message }) {
  if (!message) return null;
  return <p className="mt-1 text-xs font-medium text-rose-700">{message}</p>;
}

export function CreatePatientAppointmentModal({ open, onClose, onCreate }) {
  const titleId = useId();
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return undefined;

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

  function resetAndClose() {
    setForm(emptyForm);
    setErrors({});
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
    if (!form.date) next.date = "Date is required.";
    if (!form.time) next.time = "Time is required.";
    if (!form.type) next.type = "Appointment type is required.";
    if (!form.provider) next.provider = "Provider is required.";
    if (!form.location) next.location = "Location is required.";
    return next;
  }

  const isComplete =
    Boolean(form.date) &&
    Boolean(form.time) &&
    Boolean(form.type) &&
    Boolean(form.provider) &&
    Boolean(form.location);

  function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const provider = appointmentProviders.find(
      (item) => item.name === form.provider
    );

    onCreate?.({
      id: `apt-${form.date}-${form.time}-${form.provider}`,
      doctor: form.provider,
      specialty: provider?.specialty || "General",
      type: form.type,
      location: form.location,
      date: toDisplayDate(form.date),
      time: toDisplayTime(form.time),
      notes: form.notes.trim(),
      status: "Pending",
    });
    resetAndClose();
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
          <h2
            id={titleId}
            className="text-lg font-semibold text-ink sm:text-xl"
          >
            Create Appointment
          </h2>
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
            <div>
              <FieldLabel htmlFor="patient-appt-date">Date</FieldLabel>
              <input
                id="patient-appt-date"
                type="date"
                value={form.date}
                onChange={(event) => updateField("date", event.target.value)}
                className={cn(fieldClass, errors.date && "border-rose-300")}
              />
              <FieldError message={errors.date} />
            </div>

            <div>
              <FieldLabel htmlFor="patient-appt-time">Time</FieldLabel>
              <input
                id="patient-appt-time"
                type="time"
                value={form.time}
                onChange={(event) => updateField("time", event.target.value)}
                className={cn(fieldClass, errors.time && "border-rose-300")}
              />
              <FieldError message={errors.time} />
            </div>

            <div>
              <FieldLabel htmlFor="patient-appt-type">Type</FieldLabel>
              <DownwardSelect
                id="patient-appt-type"
                value={form.type}
                onChange={(value) => updateField("type", value)}
                options={typeOptions}
                placeholder="Select type..."
                error={Boolean(errors.type)}
              />
              <FieldError message={errors.type} />
            </div>

            <div>
              <FieldLabel htmlFor="patient-appt-provider">Provider</FieldLabel>
              <DownwardSelect
                id="patient-appt-provider"
                value={form.provider}
                onChange={(value) => updateField("provider", value)}
                options={providerOptions}
                placeholder="Select provider..."
                error={Boolean(errors.provider)}
              />
              <FieldError message={errors.provider} />
            </div>

            <div>
              <FieldLabel htmlFor="patient-appt-location">Location</FieldLabel>
              <DownwardSelect
                id="patient-appt-location"
                value={form.location}
                onChange={(value) => updateField("location", value)}
                options={locationOptions}
                placeholder="Select location..."
                error={Boolean(errors.location)}
              />
              <FieldError message={errors.location} />
            </div>

            <div>
              <FieldLabel htmlFor="patient-appt-notes">
                Notes (Optional)
              </FieldLabel>
              <textarea
                id="patient-appt-notes"
                rows={4}
                value={form.notes}
                onChange={(event) => updateField("notes", event.target.value)}
                placeholder="Any special instructions..."
                className={cn(fieldClass, "min-h-[6.5rem] resize-y")}
              />
            </div>
          </div>

          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[#f0ebe3] px-5 py-4 sm:flex-row sm:justify-end sm:gap-3 sm:px-6">
            <Button
              type="button"
              variant="outline"
              onClick={resetAndClose}
              className="border-[#e6ded5]"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isComplete}>
              Create Appointment
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
