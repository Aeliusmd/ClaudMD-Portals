"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Lock, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DownwardSelect } from "@/components/ui/downward-select";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonBlock } from "@/components/ui/skeleton";
import { useEmployerProfile } from "@/hooks/use-employer-profile";
import {
  fetchAppointmentLocations,
  fetchAppointmentPatients,
  fetchAppointmentProviders,
  fetchAppointmentSlots,
  fetchAppointmentVisitTypes,
  bookBulkAppointments,
} from "@/lib/api/employer";
import { getAccessToken } from "@/lib/auth-session";
import { isEmployerAdmin } from "@/lib/user-type";
import { cn } from "@/lib/utils";
import {
  APPOINTMENT_STATUSES,
  DURATION_OPTIONS,
  GENDER_OPTIONS,
  SCHEDULE_TYPES,
  ageFromDob,
  controlClass,
  digitsOnly,
  emptyForm,
  emptyNewPatient,
  formatDisplayDate,
  isSlotHeldByDrafts,
  newPatientDisplayName,
  sortVisitTypeOptions,
  todayIsoLocal,
  toDisplayTime,
  validateNewPatient,
} from "./helpers";
import { NewPatientPanel } from "./new-patient-panel";

let idSeq = 0;
function nextId(prefix) {
  idSeq += 1;
  return `${prefix}-${idSeq}`;
}

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

const lockedControlClass =
  "cursor-not-allowed border-border bg-cream/40 text-muted";

export function EmployerBulkAppointmentsView() {
  const { profile, loading: profileLoading } = useEmployerProfile();
  const isAdmin = Boolean(
    profile?.isAdmin || isEmployerAdmin(profile?.userGroupId)
  );
  const employerName = profile?.organization || "";

  const [form, setForm] = useState(() => ({ ...emptyForm }));
  const [newPatient, setNewPatient] = useState(() => emptyNewPatient());
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [useNewPatient, setUseNewPatient] = useState(false);
  const [errors, setErrors] = useState({});
  const [patientErrors, setPatientErrors] = useState({});
  const [formMessage, setFormMessage] = useState(null);

  const [patients, setPatients] = useState([]);
  const [localPatients, setLocalPatients] = useState([]);
  const [locations, setLocations] = useState([]);
  const [visitTypes, setVisitTypes] = useState([]);
  const [providers, setProviders] = useState([]);
  const [slots, setSlots] = useState([]);
  const [slotMeta, setSlotMeta] = useState(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [drafts, setDrafts] = useState([]);
  const [bookNotice, setBookNotice] = useState(null);
  const [booking, setBooking] = useState(false);
  const [successResult, setSuccessResult] = useState(null);

  const patientOptions = useMemo(
    () => [
      ...localPatients.map((item) => ({
        value: item.id,
        label: `${item.label} (new)`,
      })),
      ...patients.map((patient) => ({
        value: String(patient.id),
        label: patient.name,
      })),
    ],
    [localPatients, patients]
  );

  const locationOptions = useMemo(
    () =>
      locations.map((loc) => ({
        value: String(loc.id),
        label: loc.name,
      })),
    [locations]
  );

  const visitTypeOptions = useMemo(
    () => sortVisitTypeOptions(visitTypes),
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

  const selectedProvider = providers.find(
    (item) => String(item.resourceId) === String(form.resourceId)
  );

  const availableSlotOptions = useMemo(
    () =>
      slots
        .filter((slot) => !isSlotHeldByDrafts(slot.start, form, drafts))
        .map((slot) => ({
          value: slot.start,
          label: slot.label,
        })),
    [slots, form, drafts]
  );

  const heldSlotCount = slots.length - availableSlotOptions.length;

  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    async function loadStatic() {
      const token = getAccessToken();
      if (!token) return;
      setLoadingMeta(true);
      setFormMessage(null);
      try {
        const [patientRows, locationRows, visitTypeRows] = await Promise.all([
          fetchAppointmentPatients(token),
          fetchAppointmentLocations(token),
          fetchAppointmentVisitTypes(token),
        ]);
        if (cancelled) return;
        setPatients(patientRows);
        setLocations(locationRows);
        setVisitTypes(visitTypeRows);
      } catch (err) {
        if (!cancelled) {
          setFormMessage({
            type: "error",
            text: err?.message || "Unable to load booking options.",
          });
        }
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    }
    loadStatic();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!employerName) return;
    setForm((prev) =>
      prev.employerName === employerName ? prev : { ...prev, employerName }
    );
  }, [employerName]);

  useEffect(() => {
    if (!form.locationId || !form.date) {
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
          setFormMessage({
            type: "error",
            text: err?.message || "Unable to load providers.",
          });
        }
      } finally {
        if (!cancelled) setLoadingProviders(false);
      }
    }
    loadProviders();
    return () => {
      cancelled = true;
    };
  }, [form.locationId, form.date]);

  useEffect(() => {
    if (!form.locationId || !form.date || !form.resourceId) {
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
        const localSelected = String(form.patientId || "").startsWith("local-");
        const data = await fetchAppointmentSlots(token, {
          locationId: Number(form.locationId),
          resourceId: Number(form.resourceId),
          date: form.date,
          durationMinutes: duration,
          patientId:
            !useNewPatient && !localSelected && form.patientId
              ? Number(form.patientId)
              : undefined,
        });
        if (cancelled) return;
        setSlots(data.items || []);
        setSlotMeta(data);
        setForm((prev) => {
          const stillValid = (data.items || []).some(
            (slot) => slot.start === prev.startTime
          );
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
    form.locationId,
    form.date,
    form.resourceId,
    form.duration,
    form.patientId,
    useNewPatient,
  ]);

  const selectedStartTime = form.startTime;
  const selectedLocationId = form.locationId;
  const selectedDate = form.date;
  const selectedResourceId = form.resourceId;
  const selectedDuration = form.duration;

  useEffect(() => {
    if (!selectedStartTime) return;
    if (
      isSlotHeldByDrafts(
        selectedStartTime,
        {
          locationId: selectedLocationId,
          date: selectedDate,
          resourceId: selectedResourceId,
          duration: selectedDuration,
        },
        drafts
      )
    ) {
      setForm((prev) => ({ ...prev, startTime: "" }));
    }
  }, [
    drafts,
    selectedStartTime,
    selectedLocationId,
    selectedDate,
    selectedResourceId,
    selectedDuration,
  ]);

  useEffect(() => {
    if (!successResult) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") setSuccessResult(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [successResult]);

  function closeSuccessResult() {
    setSuccessResult(null);
  }

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setFormMessage(null);
    setBookNotice(null);
  }

  function clearNewPatientDemographics(prev) {
    if (prev.patientId && !String(prev.patientId).startsWith("local-")) {
      return prev;
    }
    return {
      ...prev,
      patientId: "",
      accountNo: "",
      ssn: "",
      dateOfBirth: "",
      age: "",
      gender: "",
    };
  }

  function openAddPatientForm() {
    setNewPatient(emptyNewPatient());
    setUseNewPatient(false);
    setPatientErrors({});
    setShowAddPatient(true);
    setForm((prev) => clearNewPatientDemographics(prev));
  }

  function cancelAddPatientForm() {
    setShowAddPatient(false);
    setNewPatient(emptyNewPatient());
    setUseNewPatient(false);
    setPatientErrors({});
    setForm((prev) => clearNewPatientDemographics(prev));
  }

  function applyPatient(patientId) {
    const local = localPatients.find((item) => item.id === patientId);
    if (local) {
      setUseNewPatient(true);
      setShowAddPatient(false);
      setNewPatient({ ...local.newPatient });
      setPatientErrors({});
      setForm((prev) => ({
        ...prev,
        patientId: local.id,
        accountNo: "",
        ssn: "",
        dateOfBirth: local.newPatient.dateOfBirth,
        age: ageFromDob(local.newPatient.dateOfBirth),
        gender: local.newPatient.gender,
        employerName,
      }));
      setErrors((prev) => ({ ...prev, patientId: undefined }));
      return;
    }

    const patient = patients.find((item) => String(item.id) === String(patientId));
    setUseNewPatient(false);
    setShowAddPatient(false);
    setNewPatient(emptyNewPatient());
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

  function handleConfirmNewPatient() {
    const nextErrors = validateNewPatient(newPatient);
    if (Object.keys(nextErrors).length > 0) {
      setPatientErrors(nextErrors);
      return;
    }
    const label = newPatientDisplayName(newPatient);
    const existingLocalId = String(form.patientId || "").startsWith("local-")
      ? form.patientId
      : null;
    const localId = existingLocalId || nextId("local");
    setLocalPatients((prev) => {
      const entry = { id: localId, label, newPatient: { ...newPatient } };
      if (existingLocalId) {
        return prev.map((item) => (item.id === existingLocalId ? entry : item));
      }
      return [...prev, entry];
    });
    setUseNewPatient(true);
    setShowAddPatient(false);
    setForm((prev) => ({
      ...prev,
      patientId: localId,
      accountNo: "",
      ssn: "",
      dateOfBirth: newPatient.dateOfBirth,
      age: ageFromDob(newPatient.dateOfBirth),
      gender: newPatient.gender,
      employerName,
    }));
    setErrors((prev) => ({ ...prev, patientId: undefined }));
  }

  function editNewPatient() {
    setUseNewPatient(false);
    setShowAddPatient(true);
    setPatientErrors({});
  }

  function validate() {
    const next = {};
    const isLocal = String(form.patientId || "").startsWith("local-");
    if (!useNewPatient && !isLocal && !form.patientId) {
      next.patientId = "Select a patient or add a new one.";
    }
    if (useNewPatient || isLocal) {
      const patientNext = validateNewPatient(newPatient);
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
        availableSlotOptions.length === 0
          ? "No available start times for this provider/duration."
          : "Select a start time slot.";
    } else if (isSlotHeldByDrafts(form.startTime, form, drafts)) {
      next.startTime =
        "This time is already in your list. Choose another start time.";
    } else if (!availableSlotOptions.some((slot) => slot.value === form.startTime)) {
      next.startTime = "Selected start time is no longer available. Choose another slot.";
    }
    if (!DURATION_OPTIONS.some((opt) => opt.value === String(form.duration))) {
      next.duration = "Select a duration (15, 30, 45, or 60 minutes).";
    }
    if (!form.statusId) next.statusId = "Select a status.";
    return next;
  }

  function addToList(event) {
    event.preventDefault();
    setBookNotice(null);
    const nextErrors = validate();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const isLocal = String(form.patientId || "").startsWith("local-");
    const local = localPatients.find((item) => item.id === form.patientId);
    const existing = patients.find(
      (item) => String(item.id) === String(form.patientId)
    );
    const visitType = visitTypes.find(
      (item) => String(item.id) === String(form.visitTypeId)
    );
    const location = locations.find(
      (item) => String(item.id) === String(form.locationId)
    );
    const status = APPOINTMENT_STATUSES.find(
      (item) => item.value === String(form.statusId)
    );

    setDrafts((prev) => [
      ...prev,
      {
        id: nextId("draft"),
        patientKind: useNewPatient || isLocal ? "new" : "existing",
        patientId: form.patientId,
        patientLabel:
          useNewPatient || isLocal
            ? local?.label || newPatientDisplayName(newPatient)
            : existing?.name || "Employee",
        newPatient:
          useNewPatient || isLocal
            ? { ...(local?.newPatient || newPatient) }
            : null,
        locationId: form.locationId,
        locationName: location?.name || "—",
        date: form.date,
        visitTypeId: form.visitTypeId,
        visitTypeName: visitType?.label || visitType?.name || "—",
        duration: form.duration,
        resourceId: form.resourceId,
        providerName: selectedProvider?.name || "—",
        startTime: form.startTime,
        statusId: form.statusId,
        statusLabel: status?.label || "Pending",
        scheduleTypeId: form.scheduleTypeId,
        notes: form.notes,
        error: null,
      },
    ]);
    setForm((prev) => ({ ...prev, startTime: "", notes: "" }));
    setErrors({});
    setFormMessage({
      type: "success",
      text: "Added to the list. Choose another time — or another patient — then add the next visit.",
    });
  }

  function removeDraft(draftId) {
    setDrafts((prev) => prev.filter((row) => row.id !== draftId));
    setBookNotice(null);
  }

  function mapDraftToBulkItem(row) {
    const isNew = row.patientKind === "new";
    const np = row.newPatient;
    return {
      client_id: row.id,
      client_patient_key: isNew ? String(row.patientId || "") : null,
      patient_id: isNew ? null : Number(row.patientId),
      new_patient:
        isNew && np
          ? {
              first_name: String(np.firstName || "").trim(),
              last_name: String(np.lastName || "").trim(),
              date_of_birth: np.dateOfBirth,
              gender: np.gender,
              ssn: null,
              account_no: null,
              phone: digitsOnly(np.phone),
              address1: String(np.address1 || "").trim(),
              address2: String(np.address2 || "").trim() || null,
              city: String(np.city || "").trim(),
              state: np.state,
              zip_code: String(np.zipCode || "").trim(),
            }
          : null,
      location_id: Number(row.locationId),
      resource_id: Number(row.resourceId),
      visit_type_id: Number(row.visitTypeId),
      date: row.date,
      start_time: row.startTime,
      duration_minutes: Number(row.duration),
      appointment_status_id: Number(row.statusId) || 1,
      schedule_type_id: Number(row.scheduleTypeId) || 1,
      note: String(row.notes || "").trim() || null,
    };
  }

  async function handleBookAll() {
    if (drafts.length === 0 || booking) return;
    const token = getAccessToken();
    if (!token) {
      setBookNotice("Please sign in again.");
      return;
    }

    setBooking(true);
    setBookNotice(null);
    setFormMessage(null);
    setSuccessResult(null);
    try {
      const result = await bookBulkAppointments(token, {
        items: drafts.map(mapDraftToBulkItem),
      });
      const okIds = new Set(
        result.items.filter((item) => item.ok).map((item) => item.clientId)
      );
      const createdPatientIds = new Map();
      result.items.forEach((item) => {
        if (!item.ok || !item.booking?.patientId) return;
        const source = drafts.find((row) => row.id === item.clientId);
        if (source?.patientKind === "new" && source.patientId) {
          createdPatientIds.set(
            String(source.patientId),
            String(item.booking.patientId)
          );
        }
      });
      const failedById = new Map(
        result.items
          .filter((item) => !item.ok)
          .map((item) => [item.clientId, item.error])
      );

      setDrafts((prev) =>
        prev
          .filter((row) => !okIds.has(row.id))
          .map((row) => {
            const createdId = createdPatientIds.get(String(row.patientId));
            const error = failedById.get(row.id) || null;
            if (!createdId && !error) return { ...row, error: null };
            return {
              ...row,
              error,
              ...(createdId
                ? {
                    patientKind: "existing",
                    patientId: createdId,
                    newPatient: null,
                  }
                : {}),
            };
          })
      );

      setLocalPatients((prev) =>
        prev.filter((item) => {
          if (createdPatientIds.has(item.id)) return false;
          return drafts.some(
            (row) => !okIds.has(row.id) && String(row.patientId) === item.id
          );
        })
      );

      const createdIdForForm = createdPatientIds.get(String(form.patientId || ""));
      if (createdIdForForm) {
        setUseNewPatient(false);
        setShowAddPatient(false);
        setForm((prev) => ({ ...prev, patientId: createdIdForForm }));
      }

      if (result.failedCount === 0) {
        const bookedById = new Map(
          result.items.map((item) => [item.clientId, item.booking])
        );
        setSuccessResult({
          message: result.message || "Appointments booked successfully.",
          items: drafts
            .filter((row) => okIds.has(row.id))
            .map((row) => {
              const saved = bookedById.get(row.id);
              return {
                id: row.id,
                patientLabel: row.patientLabel,
                patientKind: row.patientKind,
                visitTypeName: row.visitTypeName,
                locationName: row.locationName,
                date: row.date,
                startTime: row.startTime,
                duration: row.duration,
                providerName: row.providerName,
                scheduleId: saved?.scheduleId || saved?.appointmentId || null,
                patientWasCreated: row.patientKind === "new",
                patientSsn: saved?.patientSsn || null,
              };
            }),
        });
        setBookNotice(null);
      } else {
        setBookNotice(result.message);
      }

      try {
        const patientRows = await fetchAppointmentPatients(token);
        setPatients(patientRows);
      } catch {
        // Keep the current patient dropdown if refresh fails.
      }
    } catch (err) {
      setBookNotice(err?.message || "Unable to book bulk appointments.");
    } finally {
      setBooking(false);
    }
  }

  const newPatientLabel = useNewPatient
    ? `${newPatient.firstName} ${newPatient.lastName}`.trim()
    : "";
  const patientLocked = useNewPatient || Boolean(form.patientId);

  if (profileLoading) {
    return (
      <div className="space-y-4">
        <SkeletonBlock className="h-10 w-64" />
        <SkeletonBlock className="h-24 w-full" />
        <SkeletonBlock className="h-80 w-full" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <EmptyState
        icon={Lock}
        title="Admins only"
        description="Bulk appointment scheduling is available to employer administrators."
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bulk appointments"
        description="Use the same create-appointment form for each visit. Add it to the list, then book all when you are done. Times already in the list are hidden so two visits cannot share a slot."
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)] xl:items-start">
        <Card className="overflow-hidden">
          <div className="border-b border-border/70 px-5 py-4">
            <h2 className="text-lg font-semibold text-ink">Create appointment</h2>
            <p className="mt-1 text-sm text-muted">
              Select an existing employee or add a new one, then choose the visit details.
            </p>
          </div>

          {formMessage ? (
            <div className="px-5 pt-4">
              <div
                className={cn(
                  "rounded-xl border px-4 py-3 text-sm",
                  formMessage.type === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-800"
                    : "border-emerald-200 bg-emerald-50 text-emerald-900"
                )}
              >
                {formMessage.text}
              </div>
            </div>
          ) : null}

          <form onSubmit={addToList}>
            <div className="space-y-4 px-5 py-5">
              {loadingMeta ? (
                <p className="text-sm text-muted">Loading booking options…</p>
              ) : null}

              <div>
                <FieldLabel htmlFor="bulk-employer">Employer</FieldLabel>
                <input
                  id="bulk-employer"
                  type="text"
                  value={form.employerName || employerName}
                  readOnly
                  className={cn(controlClass, "border-border bg-cream/40")}
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <FieldLabel htmlFor="bulk-patient" required>
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
                    id="bulk-patient"
                    value={form.patientId}
                    onChange={applyPatient}
                    options={patientOptions}
                    placeholder="Select patient (employee)..."
                    searchPlaceholder="Search patient..."
                    searchable
                    error={Boolean(errors.patientId)}
                    disabled={showAddPatient}
                  />
                )}
                <FieldError message={errors.patientId} />
              </div>

              {showAddPatient ? (
                <NewPatientPanel
                  idPrefix="bulk-new"
                  value={newPatient}
                  errors={patientErrors}
                  employerName={employerName}
                  onChange={(next) => {
                    setNewPatient(next);
                    setPatientErrors({});
                  }}
                  onCancel={cancelAddPatientForm}
                  onConfirm={handleConfirmNewPatient}
                  confirmLabel="Use this patient"
                />
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel
                    htmlFor="bulk-account"
                    tag={useNewPatient ? "Auto" : undefined}
                  >
                    Account #
                  </FieldLabel>
                  <input
                    id="bulk-account"
                    type="text"
                    value={useNewPatient ? "" : form.accountNo}
                    readOnly
                    disabled
                    placeholder={
                      useNewPatient ? "Generated automatically" : undefined
                    }
                    className={cn(controlClass, lockedControlClass)}
                  />
                </div>
                <div>
                  <FieldLabel
                    htmlFor="bulk-ssn"
                    tag={useNewPatient ? "Auto" : undefined}
                  >
                    SSN #
                  </FieldLabel>
                  <input
                    id="bulk-ssn"
                    type="text"
                    value={useNewPatient ? "" : form.ssn}
                    readOnly
                    disabled
                    placeholder={
                      useNewPatient ? "Generated automatically" : undefined
                    }
                    className={cn(controlClass, lockedControlClass)}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <FieldLabel htmlFor="bulk-dob">Date of Birth</FieldLabel>
                  <input
                    id="bulk-dob"
                    type="date"
                    value={form.dateOfBirth}
                    readOnly
                    disabled
                    className={cn(controlClass, lockedControlClass)}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="bulk-age">Age</FieldLabel>
                  <input
                    id="bulk-age"
                    type="text"
                    value={form.age}
                    readOnly
                    disabled
                    className={cn(controlClass, lockedControlClass)}
                  />
                </div>
              </div>

              <div>
                <FieldLabel htmlFor="bulk-gender">Gender</FieldLabel>
                <DownwardSelect
                  id="bulk-gender"
                  value={form.gender}
                  onChange={(value) => setField("gender", value)}
                  options={GENDER_OPTIONS}
                  placeholder="Select gender..."
                  disabled={patientLocked}
                />
              </div>

              <div>
                <FieldLabel htmlFor="bulk-location" required>
                  Location
                </FieldLabel>
                <DownwardSelect
                  id="bulk-location"
                  value={form.locationId}
                  onChange={(value) => setField("locationId", value)}
                  options={locationOptions}
                  placeholder="Select location..."
                  error={Boolean(errors.locationId)}
                />
                <FieldError message={errors.locationId} />
              </div>

              <div>
                <FieldLabel htmlFor="bulk-date" required>
                  Date
                </FieldLabel>
                <input
                  id="bulk-date"
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
                <FieldLabel htmlFor="bulk-provider" required>
                  Provider
                </FieldLabel>
                <DownwardSelect
                  id="bulk-provider"
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
                          .map(
                            (s) =>
                              `${toDisplayTime(s.start)}–${toDisplayTime(s.end)}`
                          )
                          .join(", ")}`
                      : null}
                  </p>
                ) : null}
              </div>

              <div>
                <FieldLabel htmlFor="bulk-visit-type" required>
                  Visit Type
                </FieldLabel>
                <DownwardSelect
                  id="bulk-visit-type"
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
                  <FieldLabel htmlFor="bulk-duration" required>
                    Duration
                  </FieldLabel>
                  <DownwardSelect
                    id="bulk-duration"
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
                  <FieldLabel htmlFor="bulk-start" required>
                    Start Time
                  </FieldLabel>
                  <DownwardSelect
                    id="bulk-start"
                    value={form.startTime}
                    onChange={(value) => setField("startTime", value)}
                    options={availableSlotOptions}
                    placeholder={
                      !form.resourceId
                        ? "Select provider first..."
                        : loadingSlots
                          ? "Calculating slots..."
                          : availableSlotOptions.length
                            ? "Select start time..."
                            : "No free slots for this duration"
                    }
                    error={Boolean(errors.startTime)}
                    disabled={!form.resourceId || loadingSlots}
                  />
                  <FieldError message={errors.startTime} />
                  {heldSlotCount > 0 ? (
                    <p className="mt-1 text-xs text-muted">
                      {heldSlotCount} time
                      {heldSlotCount === 1 ? "" : "s"} hidden because they are
                      already in your list.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="bulk-status" required>
                    Status
                  </FieldLabel>
                  <DownwardSelect
                    id="bulk-status"
                    value={form.statusId}
                    onChange={(value) => setField("statusId", value)}
                    options={APPOINTMENT_STATUSES}
                    placeholder="Select status..."
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="bulk-schedule-type">
                    Schedule Type
                  </FieldLabel>
                  <DownwardSelect
                    id="bulk-schedule-type"
                    value={form.scheduleTypeId}
                    onChange={(value) => setField("scheduleTypeId", value)}
                    options={SCHEDULE_TYPES}
                    placeholder="Select schedule type..."
                  />
                </div>
              </div>

              <div>
                <FieldLabel htmlFor="bulk-notes">Note</FieldLabel>
                <textarea
                  id="bulk-notes"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                  placeholder="Any special instructions..."
                  className={cn(controlClass, "resize-y border-border")}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border/70 px-5 py-4">
              <Button type="submit" disabled={loadingMeta || booking}>
                Add to list
              </Button>
            </div>
          </form>
        </Card>

        <Card className="overflow-hidden xl:sticky xl:top-4">
          <div className="flex items-start justify-between gap-3 border-b border-border/70 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-ink">Appointment list</h2>
              <p className="mt-1 text-sm text-muted">
                {drafts.length} visit{drafts.length === 1 ? "" : "s"} ready
              </p>
            </div>
            <Badge className="bg-cream-deep text-ink">{drafts.length}</Badge>
          </div>

          {bookNotice ? (
            <div className="px-5 pt-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {bookNotice}
              </div>
            </div>
          ) : null}

          {drafts.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Nothing in the list yet"
                description="Fill the form on the left and click Add to list. You can keep adding visits for the same person or switch to someone else."
              />
            </div>
          ) : (
            <ul className="max-h-[70vh] divide-y divide-border/60 overflow-y-auto">
              {drafts.map((row, index) => (
                <li
                  key={row.id}
                  className={cn(
                    "px-5 py-4",
                    row.error ? "bg-rose-50/70" : null
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">
                        {index + 1}. {row.patientLabel}
                        {row.patientKind === "new" ? (
                          <span className="ml-2 text-xs font-semibold text-primary">
                            new
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-sm text-muted">
                        {row.visitTypeName}
                      </p>
                      <p className="mt-0.5 text-sm text-muted">
                        {row.locationName} · {formatDisplayDate(row.date)} ·{" "}
                        {toDisplayTime(row.startTime)} · {row.duration} min
                      </p>
                      <p className="mt-0.5 text-sm text-muted">
                        {row.providerName} · {row.statusLabel}
                      </p>
                      {row.error ? (
                        <p className="mt-2 text-xs font-medium text-rose-700">
                          {row.error}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      title="Remove from list"
                      onClick={() => removeDraft(row.id)}
                      disabled={booking}
                      className="cursor-pointer rounded-lg p-2 text-muted hover:bg-cream hover:text-rose-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-border/70 px-5 py-4">
            <Button
              type="button"
              className="w-full"
              disabled={drafts.length === 0 || booking}
              onClick={handleBookAll}
            >
              {booking ? "Booking…" : "Book all appointments"}
            </Button>
          </div>
        </Card>
      </div>

      {successResult ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/45 p-4 sm:items-center">
          <button
            type="button"
            aria-label="Close success dialog"
            className="absolute inset-0 cursor-pointer"
            onClick={closeSuccessResult}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-success-title"
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-border/70 bg-white shadow-xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border/70 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
                  <Check className="h-5 w-5" strokeWidth={2.5} />
                </span>
                <div>
                  <h3 id="bulk-success-title" className="text-lg font-semibold text-ink">
                    Appointments booked
                  </h3>
                  <p className="mt-0.5 text-sm text-muted">
                    {successResult.items.length} visit
                    {successResult.items.length === 1 ? "" : "s"} saved
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={closeSuccessResult}
                className="cursor-pointer rounded-lg p-2 text-muted hover:bg-cream-deep hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[min(60vh,28rem)] space-y-3 overflow-y-auto px-5 py-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <p className="font-semibold">{successResult.message}</p>
              </div>
              <ul className="space-y-3">
                {successResult.items.map((row, index) => (
                  <li
                    key={row.id}
                    className="rounded-xl border border-border/70 bg-cream/30 px-4 py-3 text-sm"
                  >
                    <p className="font-semibold text-ink">
                      {index + 1}. {row.patientLabel}
                      {row.patientWasCreated ? " (new)" : ""}
                    </p>
                    <p className="mt-1 text-muted">
                      Reference #: {row.scheduleId || "—"}
                    </p>
                    <p className="mt-0.5 text-muted">
                      {row.visitTypeName} · {row.locationName}
                    </p>
                    <p className="mt-0.5 text-muted">
                      {formatDisplayDate(row.date)} · {toDisplayTime(row.startTime)}
                      {row.providerName && row.providerName !== "—"
                        ? ` · ${row.providerName}`
                        : ""}
                      {row.duration ? ` · ${row.duration} min` : ""}
                    </p>
                    {row.patientWasCreated && row.patientSsn ? (
                      <p className="mt-1 font-medium text-ink">
                        Patient created successfully · SSN {row.patientSsn}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex justify-end border-t border-border/70 px-5 py-4">
              <Button type="button" onClick={closeSuccessResult}>
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
