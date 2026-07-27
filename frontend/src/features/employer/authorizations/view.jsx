"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Plus,
  Shield,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/search-input";
import {
  authorizations as initialAuthorizations,
  employees,
} from "@/data/employer";
import { authorizationStatusStyles } from "@/lib/category-styles";
import { AuthorizationDetailGrid } from "@/features/employer/authorizations/authorization-detail-grid";
import { AuthorizationForm } from "@/features/employer/authorizations/authorization-form";
import {
  collectSelectedServiceLabels,
  employeeAuthExtras,
  emptyForm,
  parseDisplayDob,
  serviceGroups,
  validateForm,
} from "@/features/employer/authorizations/form-utils";
import { SummaryStatCard } from "@/features/employer/authorizations/summary-stat-card";
import { AuthorizationStatusIcon } from "@/features/employer/authorizations/status-icon";

export function EmployerAuthorizationsView() {
  const [requests, setRequests] = useState(initialAuthorizations);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});

  const stats = useMemo(
    () => ({
      total: requests.length,
      approved: requests.filter((item) => item.status === "Approved").length,
      pending: requests.filter((item) => item.status === "Pending").length,
    }),
    [requests]
  );

  const filtered = useMemo(() => {
    let rows = requests;
    if (statusFilter === "Approved" || statusFilter === "Pending") {
      rows = rows.filter((item) => item.status === statusFilter);
    }

    const normalized = query.trim().toLowerCase();
    if (!normalized) return rows;
    return rows.filter((item) => {
      const haystack = [
        item.employee,
        item.reference,
        item.type,
        item.incidentNumber,
        item.authId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [query, requests, statusFilter]);

  function openForm() {
    setShowForm(true);
    setExpandedId(null);
    setErrors({});
  }

  function closeForm() {
    setShowForm(false);
    setForm(emptyForm);
    setErrors({});
  }

  function handleEmployeeChange(employeeId) {
    const employee = employees.find((item) => item.id === employeeId);
    const extras = employeeAuthExtras[employeeId] || {};
    setForm((prev) => ({
      ...prev,
      employeeId,
      gender: extras.gender || "",
      dateOfBirth: employee ? parseDisplayDob(employee.dateOfBirth) : "",
      ssn: employee?.ssn || "",
      companyName: employee?.employerName || "TechFlow Inc.",
      phone: extras.phone || "",
    }));
    setErrors((prev) => ({
      ...prev,
      employeeId: undefined,
      gender: undefined,
      dateOfBirth: undefined,
      ssn: undefined,
      companyName: undefined,
      phone: undefined,
    }));
  }

  function onFieldChange(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function toggleService(serviceId, parentId) {
    setForm((prev) => {
      const next = { ...prev.services, [serviceId]: !prev.services[serviceId] };
      if (parentId && next[serviceId]) {
        next[parentId] = true;
      }
      if (parentId && !next[serviceId]) {
        const parent = serviceGroups.find((group) => group.id === parentId);
        const anyChild =
          parent?.children.some((child) => next[child.id]) ?? false;
        if (!anyChild) next[parentId] = false;
      }
      return { ...prev, services: next };
    });
    setErrors((prev) => ({ ...prev, services: undefined }));
  }

  function toggleParent(group) {
    setForm((prev) => {
      const checked = !prev.services[group.id];
      const next = { ...prev.services, [group.id]: checked };
      if (!checked && group.children.length) {
        for (const child of group.children) {
          next[child.id] = false;
        }
      }
      return { ...prev, services: next };
    });
    setErrors((prev) => ({ ...prev, services: undefined }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validateForm(form);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const employee = employees.find((item) => item.id === form.employeeId);
    const incident = employee?.incidents?.[0];
    const reference = `REF-${88320 + requests.length}`;
    const authId = `AUTH-2026-${String(requests.length + 13).padStart(4, "0")}`;
    const submittedDate = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const serviceLabels = collectSelectedServiceLabels(form.services);
    const type = serviceLabels[0] || "Treatment Authorization";

    const newRequest = {
      id: `auth-${Date.now()}`,
      authId,
      type,
      employee: employee.name,
      employeeId: employee.id,
      incidentNumber: incident?.incidentNumber || "N/A",
      reference,
      submittedDate,
      status: "Pending",
      notes: form.notes.trim() || form.natureOfInjury.trim(),
    };

    setRequests((prev) => [newRequest, ...prev]);
    setConfirmation(reference);
    closeForm();
    setExpandedId(newRequest.id);
  }

  return (
    <div>
      <div className="mb-4 sm:mb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl md:text-4xl">
              Treatment Authorizations
            </h1>
            <p className="mt-1.5 text-sm text-muted">
              Medical treatment authorization requests &amp; history
            </p>
          </div>
          <div className="hidden shrink-0 sm:block">
            {showForm ? (
              <Button type="button" variant="outline" onClick={closeForm}>
                <X className="h-4 w-4" />
                Cancel
              </Button>
            ) : (
              <Button type="button" onClick={openForm}>
                <Plus className="h-4 w-4" />
                New Authorization
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 sm:hidden">
          {showForm ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={closeForm}
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
          ) : (
            <Button type="button" className="w-full" onClick={openForm}>
              <Plus className="h-4 w-4" />
              New Authorization
            </Button>
          )}
        </div>
      </div>

      <div className="mb-5 -mx-1 flex gap-3 overflow-x-auto px-1 pb-1 snap-x snap-mandatory sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0">
        <SummaryStatCard
          active={statusFilter === "all"}
          label="Total Requests"
          value={stats.total}
          valueClassName="text-ink"
          iconWrap="bg-sky-50 text-primary"
          icon={<Shield className="h-5 w-5" />}
          onClick={() => setStatusFilter("all")}
        />
        <SummaryStatCard
          active={statusFilter === "Approved"}
          label="Approved"
          value={stats.approved}
          valueClassName="text-emerald-700"
          iconWrap="bg-emerald-50 text-emerald-600"
          icon={<CheckCircle2 className="h-5 w-5" />}
          onClick={() =>
            setStatusFilter((prev) =>
              prev === "Approved" ? "all" : "Approved"
            )
          }
        />
        <SummaryStatCard
          active={statusFilter === "Pending"}
          label="Pending Review"
          value={stats.pending}
          valueClassName="text-amber-700"
          iconWrap="bg-amber-50 text-amber-600"
          icon={<Clock className="h-5 w-5" />}
          onClick={() =>
            setStatusFilter((prev) => (prev === "Pending" ? "all" : "Pending"))
          }
        />
      </div>

      {confirmation ? (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Authorization submitted successfully. Reference:{" "}
          <span className="font-semibold">{confirmation}</span>
        </div>
      ) : null}

      {showForm ? (
        <AuthorizationForm
          form={form}
          errors={errors}
          employees={employees}
          onSubmit={handleSubmit}
          onClose={closeForm}
          onEmployeeChange={handleEmployeeChange}
          onToggleService={toggleService}
          onToggleParent={toggleParent}
          onFieldChange={onFieldChange}
        />
      ) : null}

      <SearchInput
        className="mb-5"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by patient, reference, or type..."
        ariaLabel="Search authorizations"
      />

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted">
            No authorizations match your search or filters.
          </Card>
        ) : (
          filtered.map((item) => {
            const expanded = expandedId === item.id;
            return (
              <Card key={item.id} className="overflow-hidden p-0 shadow-sm">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedId((prev) => (prev === item.id ? null : item.id))
                  }
                  className="flex w-full cursor-pointer items-center gap-3 p-4 text-left transition hover:bg-cream/30 sm:items-start sm:p-5"
                >
                  <AuthorizationStatusIcon status={item.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-ink">
                        {item.type}
                      </h2>
                      <Badge className={authorizationStatusStyles[item.status]}>
                        {item.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm tabular-nums text-muted">
                      {item.employee} · Incident: {item.incidentNumber}
                    </p>
                  </div>
                  <div className="hidden shrink-0 text-right text-sm sm:block">
                    <p className="font-semibold tabular-nums text-ink">
                      {item.reference}
                    </p>
                    <p className="mt-1 text-muted">{item.submittedDate}</p>
                  </div>
                  <span className="shrink-0 text-muted">
                    {expanded ? (
                      <ChevronUp className="h-5 w-5" />
                    ) : (
                      <ChevronDown className="h-5 w-5" />
                    )}
                  </span>
                </button>
                {expanded ? <AuthorizationDetailGrid item={item} /> : null}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
