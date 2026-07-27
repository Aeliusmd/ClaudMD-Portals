import { Send, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  FieldLabel,
  FormError,
  SectionStep,
} from "@/features/employer/authorizations/form-fields";
import { ServiceGroup } from "@/features/employer/authorizations/service-group";
import {
  NOTES_MAX,
  formatTodayLabel,
  serviceGroups,
} from "@/features/employer/authorizations/form-utils";

export function AuthorizationForm({
  form,
  errors,
  employees,
  onSubmit,
  onClose,
  onEmployeeChange,
  onToggleService,
  onToggleParent,
  onFieldChange,
}) {
  return (
    <Card className="mb-6 overflow-hidden p-0">
      <div className="flex flex-col gap-2 bg-primary px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Medical Treatment Authorization</p>
            <p className="text-sm text-white/85">
              Complete all required sections below
            </p>
          </div>
        </div>
        <p className="text-sm font-medium text-white/90">
          Date {formatTodayLabel()}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-8 p-5 sm:p-6">
        <section>
          <SectionStep number="1" title="Employee Information" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block space-y-1.5" htmlFor="auth-employee">
                <FieldLabel required>Employee Name</FieldLabel>
                <select
                  id="auth-employee"
                  value={form.employeeId}
                  onChange={(e) => onEmployeeChange(e.target.value)}
                  className={cn(
                    "w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
                    errors.employeeId ? "border-rose-400" : "border-border"
                  )}
                >
                  <option value="">Select employee</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </select>
                <FormError message={errors.employeeId} />
              </label>
            </div>

            <fieldset>
              <FieldLabel required>Gender</FieldLabel>
              <div className="mt-2 flex gap-4">
                {["Male", "Female"].map((value) => (
                  <label
                    key={value}
                    className="inline-flex items-center gap-2 text-sm font-medium text-ink"
                  >
                    <input
                      type="radio"
                      name="auth-gender"
                      value={value}
                      checked={form.gender === value}
                      onChange={() => onFieldChange("gender", value)}
                      className="h-4 w-4 border-border text-primary focus:ring-primary/30"
                    />
                    {value}
                  </label>
                ))}
              </div>
              <FormError message={errors.gender} />
            </fieldset>

            <label className="block space-y-1.5" htmlFor="auth-dob">
              <FieldLabel required>Employee Date of Birth</FieldLabel>
              <input
                id="auth-dob"
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => onFieldChange("dateOfBirth", e.target.value)}
                className={cn(
                  "w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
                  errors.dateOfBirth ? "border-rose-400" : "border-border"
                )}
              />
              <FormError message={errors.dateOfBirth} />
            </label>

            <label className="block space-y-1.5" htmlFor="auth-ssn">
              <FieldLabel required>Social Security #</FieldLabel>
              <input
                id="auth-ssn"
                value={form.ssn}
                onChange={(e) => onFieldChange("ssn", e.target.value)}
                placeholder="XXX-XX-XXXX"
                className={cn(
                  "w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
                  errors.ssn ? "border-rose-400" : "border-border"
                )}
              />
              <FormError message={errors.ssn} />
            </label>

            <label className="block space-y-1.5" htmlFor="auth-company">
              <FieldLabel required>Company Name</FieldLabel>
              <input
                id="auth-company"
                value={form.companyName}
                onChange={(e) => onFieldChange("companyName", e.target.value)}
                className={cn(
                  "w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
                  errors.companyName ? "border-rose-400" : "border-border"
                )}
              />
              <FormError message={errors.companyName} />
            </label>

            <label className="block space-y-1.5" htmlFor="auth-phone">
              <FieldLabel required>Phone</FieldLabel>
              <input
                id="auth-phone"
                value={form.phone}
                onChange={(e) => onFieldChange("phone", e.target.value)}
                placeholder="(555) 000-0000"
                className={cn(
                  "w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
                  errors.phone ? "border-rose-400" : "border-border"
                )}
              />
              <FormError message={errors.phone} />
            </label>

            <label
              className="block space-y-1.5 sm:col-span-2"
              htmlFor="auth-injury"
            >
              <FieldLabel required>Nature of Injury / Illness</FieldLabel>
              <input
                id="auth-injury"
                value={form.natureOfInjury}
                onChange={(e) =>
                  onFieldChange("natureOfInjury", e.target.value)
                }
                placeholder="Describe the nature of the injury or illness..."
                className={cn(
                  "w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
                  errors.natureOfInjury ? "border-rose-400" : "border-border"
                )}
              />
              <FormError message={errors.natureOfInjury} />
            </label>
          </div>
        </section>

        <section>
          <SectionStep
            number="2"
            title="Services Requested"
            hint="(Check all that apply)"
          />
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              {serviceGroups.slice(0, 2).map((group) => (
                <ServiceGroup
                  key={group.id}
                  group={group}
                  services={form.services}
                  onToggleParent={() => onToggleParent(group)}
                  onToggleChild={(childId) => onToggleService(childId, group.id)}
                />
              ))}
            </div>
            <div className="space-y-4">
              {serviceGroups.slice(2).map((group) => (
                <ServiceGroup
                  key={group.id}
                  group={group}
                  services={form.services}
                  onToggleParent={() => onToggleParent(group)}
                  onToggleChild={(childId) => onToggleService(childId, group.id)}
                />
              ))}
            </div>
          </div>
          <FormError message={errors.services} />
        </section>

        <section>
          <SectionStep number="3" title="Services / Additional Notes" />
          <label className="block" htmlFor="auth-notes">
            <textarea
              id="auth-notes"
              value={form.notes}
              onChange={(e) => onFieldChange("notes", e.target.value)}
              rows={5}
              maxLength={NOTES_MAX}
              placeholder="Include any additional instructions, notes, or reason for this authorization request..."
              className={cn(
                "w-full resize-y rounded-lg border bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
                errors.notes ? "border-rose-400" : "border-border"
              )}
            />
            <div className="mt-1 flex items-center justify-between gap-2">
              <FormError message={errors.notes} />
              <span className="ml-auto text-xs text-muted">
                {form.notes.length}/{NOTES_MAX}
              </span>
            </div>
          </label>
        </section>

        <div className="flex flex-wrap justify-end gap-2 border-t border-border/70 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">
            <Send className="h-4 w-4" />
            Submit Authorization
          </Button>
        </div>
      </form>
    </Card>
  );
}
