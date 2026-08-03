"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { FileText, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  appointmentClinics,
  appointmentProviders,
  appointmentTypes,
  employees,
} from "@/data/employer";
import { DownwardSelect } from "@/components/ui/downward-select";
import { cn } from "@/lib/utils";

const emptyForm = {
  employeeId: "",
  date: "",
  time: "",
  type: "",
  provider: "",
  clinic: "",
  notes: "",
};

function FieldError({ message }) {
  if (!message) return null;
  return <p className="mt-1 text-xs font-medium text-rose-700">{message}</p>;
}

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

const controlClass =
  "w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60";

export function CreateAppointmentModal({ open, onClose, onCreate }) {
  const titleId = useId();
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});

  const employeeOptions = useMemo(
    () =>
      employees.map((employee) => ({
        value: employee.id,
        label: employee.name,
      })),
    []
  );

  const typeOptions = useMemo(
    () => appointmentTypes.map((type) => ({ value: type, label: type })),
    []
  );

  const providerOptions = useMemo(
    () =>
      appointmentProviders.map((provider) => ({
        value: provider,
        label: provider,
      })),
    []
  );

  const clinicOptions = useMemo(
    () =>
      appointmentClinics.map((clinic) => ({
        value: clinic,
        label: clinic,
      })),
    []
  );

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

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function validate() {
    const next = {};
    if (!form.employeeId) next.employeeId = "Select an employee.";
    if (!form.date) next.date = "Enter a date.";
    if (!form.time) next.time = "Enter a time.";
    if (!form.type) next.type = "Select an appointment type.";
    return next;
  }

  function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validate();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const employee = employees.find((item) => item.id === form.employeeId);
    const incident = employee?.incidents?.[0];
    const category = incident?.category || "Physical";

    const dateObj = new Date(`${form.date}T12:00:00`);
    const displayDate = dateObj.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    const [hours, minutes] = form.time.split(":").map(Number);
    const period = hours >= 12 ? "PM" : "AM";
    const hour12 = hours % 12 || 12;
    const displayTime = `${hour12}:${String(minutes).padStart(2, "0")} ${period}`;

    onCreate({
      id: `eap-${Date.now()}`,
      employee: employee.name,
      employeeId: employee.id,
      category,
      visitType: form.type,
      type: form.type,
      provider: form.provider || "Unassigned",
      clinic: form.clinic || "TBD",
      date: displayDate,
      time: displayTime,
      dateValue: form.date,
      status: "Pending",
      notes: form.notes.trim(),
    });

    setForm(emptyForm);
    setErrors({});
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto p-4 sm:items-center">
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
        className="relative z-10 my-4 w-full max-w-lg overflow-visible rounded-2xl border border-border/70 bg-white shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-ink">
            Create Appointment
          </h2>
          <button
            type="button"
            aria-label="Close"
            onClick={resetAndClose}
            className="cursor-pointer rounded-lg p-2 text-muted transition hover:bg-cream-deep hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-visible">
          <div className="space-y-4 px-5 py-5 pb-6">
            <div>
              <FieldLabel htmlFor="appt-employee" required>
                Employee
              </FieldLabel>
              <DownwardSelect
                id="appt-employee"
                value={form.employeeId}
                onChange={(value) => setField("employeeId", value)}
                options={employeeOptions}
                placeholder="Select an employee..."
                error={Boolean(errors.employeeId)}
              />
              <FieldError message={errors.employeeId} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="appt-date" required>
                  Date
                </FieldLabel>
                <input
                  id="appt-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setField("date", e.target.value)}
                  className={cn(
                    controlClass,
                    errors.date ? "border-rose-400" : "border-border"
                  )}
                />
                <FieldError message={errors.date} />
              </div>
              <div>
                <FieldLabel htmlFor="appt-time" required>
                  Time
                </FieldLabel>
                <input
                  id="appt-time"
                  type="time"
                  value={form.time}
                  onChange={(e) => setField("time", e.target.value)}
                  className={cn(
                    controlClass,
                    errors.time ? "border-rose-400" : "border-border"
                  )}
                />
                <FieldError message={errors.time} />
              </div>
            </div>

            <div>
              <FieldLabel htmlFor="appt-type" required>
                Type
              </FieldLabel>
              <DownwardSelect
                id="appt-type"
                value={form.type}
                onChange={(value) => setField("type", value)}
                options={typeOptions}
                placeholder="Select type..."
                error={Boolean(errors.type)}
              />
              <FieldError message={errors.type} />
            </div>

            <div>
              <FieldLabel htmlFor="appt-provider">Provider</FieldLabel>
              <DownwardSelect
                id="appt-provider"
                value={form.provider}
                onChange={(value) => setField("provider", value)}
                options={providerOptions}
                placeholder="Select provider..."
              />
            </div>

            <div>
              <FieldLabel htmlFor="appt-clinic">Clinic</FieldLabel>
              <DownwardSelect
                id="appt-clinic"
                value={form.clinic}
                onChange={(value) => setField("clinic", value)}
                options={clinicOptions}
                placeholder="Select clinic..."
              />
            </div>

            <div>
              <FieldLabel htmlFor="appt-notes">Notes (optional)</FieldLabel>
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

          <div className="flex flex-wrap justify-end gap-2 border-t border-border/70 px-5 py-4">
            <Button type="button" variant="outline" onClick={resetAndClose}>
              Cancel
            </Button>
            <Button type="submit">Create Appointment</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
