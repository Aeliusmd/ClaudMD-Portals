"use client";

import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const emptyForm = {
  doctor: "",
  specialty: "",
  type: "",
  date: "",
  time: "",
  location: "",
  notes: "",
};

const fieldClass =
  "w-full rounded-xl border border-[#e6ded5] bg-[#fef9f3] px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-[#b0a89e] focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/15";

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
    if (!form.doctor.trim()) next.doctor = "Doctor is required.";
    if (!form.specialty.trim()) next.specialty = "Specialty is required.";
    if (!form.type.trim()) next.type = "Appointment type is required.";
    if (!form.date.trim()) next.date = "Date is required.";
    if (!form.time.trim()) next.time = "Time is required.";
    if (!form.location.trim()) next.location = "Location is required.";
    return next;
  }

  function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    onCreate?.({
      id: `apt-${Date.now()}`,
      doctor: form.doctor.trim(),
      specialty: form.specialty.trim(),
      type: form.type.trim(),
      location: form.location.trim(),
      date: form.date.trim(),
      time: form.time.trim(),
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
        className="relative z-10 my-4 flex max-h-[min(92dvh,44rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#ece7df] bg-white shadow-xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#f0ebe3] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-lg font-semibold text-ink sm:text-xl"
            >
              Create Appointment
            </h2>
            <p className="mt-1 text-sm text-muted">
              Schedule a new appointment with your provider
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
          className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6"
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="patient-appt-doctor">Doctor</FieldLabel>
                <input
                  id="patient-appt-doctor"
                  value={form.doctor}
                  onChange={(e) => updateField("doctor", e.target.value)}
                  placeholder="e.g. Dr. Sarah Williams"
                  className={cn(fieldClass, errors.doctor && "border-rose-300")}
                />
                <FieldError message={errors.doctor} />
              </div>
              <div>
                <FieldLabel htmlFor="patient-appt-specialty">
                  Specialty
                </FieldLabel>
                <input
                  id="patient-appt-specialty"
                  value={form.specialty}
                  onChange={(e) => updateField("specialty", e.target.value)}
                  placeholder="e.g. Primary Care"
                  className={cn(
                    fieldClass,
                    errors.specialty && "border-rose-300"
                  )}
                />
                <FieldError message={errors.specialty} />
              </div>
            </div>

            <div>
              <FieldLabel htmlFor="patient-appt-type">
                Appointment Type
              </FieldLabel>
              <input
                id="patient-appt-type"
                value={form.type}
                onChange={(e) => updateField("type", e.target.value)}
                placeholder="e.g. Annual Physical, Follow-up"
                className={cn(fieldClass, errors.type && "border-rose-300")}
              />
              <FieldError message={errors.type} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="patient-appt-date">Date</FieldLabel>
                <input
                  id="patient-appt-date"
                  value={form.date}
                  onChange={(e) => updateField("date", e.target.value)}
                  placeholder="e.g. Aug 15, 2026"
                  className={cn(fieldClass, errors.date && "border-rose-300")}
                />
                <FieldError message={errors.date} />
              </div>
              <div>
                <FieldLabel htmlFor="patient-appt-time">Time</FieldLabel>
                <input
                  id="patient-appt-time"
                  value={form.time}
                  onChange={(e) => updateField("time", e.target.value)}
                  placeholder="e.g. 10:30 AM"
                  className={cn(fieldClass, errors.time && "border-rose-300")}
                />
                <FieldError message={errors.time} />
              </div>
            </div>

            <div>
              <FieldLabel htmlFor="patient-appt-location">Location</FieldLabel>
              <input
                id="patient-appt-location"
                value={form.location}
                onChange={(e) => updateField("location", e.target.value)}
                placeholder="e.g. Downtown Clinic"
                className={cn(fieldClass, errors.location && "border-rose-300")}
              />
              <FieldError message={errors.location} />
            </div>

            <div>
              <FieldLabel htmlFor="patient-appt-notes">Notes</FieldLabel>
              <textarea
                id="patient-appt-notes"
                rows={4}
                value={form.notes}
                onChange={(e) => updateField("notes", e.target.value)}
                placeholder="Any special instructions or notes..."
                className={cn(fieldClass, "resize-y min-h-[6.5rem]")}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={resetAndClose}
              className="border-[#e6ded5]"
            >
              Cancel
            </Button>
            <Button type="submit">Schedule Appointment</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
