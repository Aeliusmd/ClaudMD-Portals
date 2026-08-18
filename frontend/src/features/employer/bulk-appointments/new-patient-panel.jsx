"use client";

import { Button } from "@/components/ui/button";
import { DownwardSelect } from "@/components/ui/downward-select";
import { cn } from "@/lib/utils";
import {
  CELL_PHONE_DIGITS,
  GENDER_OPTIONS,
  US_STATE_OPTIONS,
  controlClass,
  digitsOnly,
  sanitizePatientGivenName,
  sanitizePersonName,
  sanitizeZipCode,
  todayIsoLocal,
} from "./helpers";

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

export function NewPatientPanel({
  idPrefix = "bulk-new",
  value,
  errors = {},
  employerName,
  onChange,
  onCancel,
  onConfirm,
  confirmLabel = "Add this employee",
}) {
  function setField(field, nextValue) {
    onChange({ ...value, [field]: nextValue });
  }

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-cream/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink">
          New employee for {employerName || "this employer"}
        </p>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer text-xs font-semibold text-muted hover:text-ink"
          >
            Cancel
          </button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor={`${idPrefix}-first`} required>
            First Name
          </FieldLabel>
          <input
            id={`${idPrefix}-first`}
            type="text"
            autoComplete="given-name"
            value={value.firstName}
            onChange={(e) =>
              setField("firstName", sanitizePatientGivenName(e.target.value))
            }
            className={cn(
              controlClass,
              errors.firstName ? "border-rose-400" : "border-border"
            )}
          />
          <FieldError message={errors.firstName} />
        </div>
        <div>
          <FieldLabel htmlFor={`${idPrefix}-last`} required>
            Last Name
          </FieldLabel>
          <input
            id={`${idPrefix}-last`}
            type="text"
            autoComplete="family-name"
            value={value.lastName}
            onChange={(e) =>
              setField("lastName", sanitizePatientGivenName(e.target.value))
            }
            className={cn(
              controlClass,
              errors.lastName ? "border-rose-400" : "border-border"
            )}
          />
          <FieldError message={errors.lastName} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor={`${idPrefix}-dob`} required>
            Date of Birth
          </FieldLabel>
          <input
            id={`${idPrefix}-dob`}
            type="date"
            max={todayIsoLocal()}
            value={value.dateOfBirth}
            onChange={(e) => setField("dateOfBirth", e.target.value)}
            className={cn(
              controlClass,
              errors.dateOfBirth ? "border-rose-400" : "border-border"
            )}
          />
          <FieldError message={errors.dateOfBirth} />
        </div>
        <div>
          <FieldLabel htmlFor={`${idPrefix}-gender`} required>
            Gender
          </FieldLabel>
          <DownwardSelect
            id={`${idPrefix}-gender`}
            value={value.gender}
            onChange={(next) => setField("gender", next)}
            options={GENDER_OPTIONS}
            placeholder="Select gender..."
            error={Boolean(errors.gender)}
          />
          <FieldError message={errors.gender} />
        </div>
      </div>

      <div>
        <FieldLabel htmlFor={`${idPrefix}-address1`} required>
          Address 1
        </FieldLabel>
        <input
          id={`${idPrefix}-address1`}
          type="text"
          value={value.address1}
          onChange={(e) => setField("address1", e.target.value)}
          className={cn(
            controlClass,
            errors.address1 ? "border-rose-400" : "border-border"
          )}
        />
        <FieldError message={errors.address1} />
      </div>

      <div>
        <FieldLabel htmlFor={`${idPrefix}-address2`}>Address 2</FieldLabel>
        <input
          id={`${idPrefix}-address2`}
          type="text"
          value={value.address2}
          onChange={(e) => setField("address2", e.target.value)}
          className={cn(controlClass, "border-border")}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <FieldLabel htmlFor={`${idPrefix}-zip`} required>
            Zip
          </FieldLabel>
          <input
            id={`${idPrefix}-zip`}
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={10}
            placeholder="12345 or 12345-6789"
            value={value.zipCode}
            onChange={(e) => setField("zipCode", sanitizeZipCode(e.target.value))}
            className={cn(
              controlClass,
              errors.zipCode ? "border-rose-400" : "border-border"
            )}
          />
          <FieldError message={errors.zipCode} />
        </div>
        <div>
          <FieldLabel htmlFor={`${idPrefix}-city`} required>
            City
          </FieldLabel>
          <input
            id={`${idPrefix}-city`}
            type="text"
            autoComplete="address-level2"
            value={value.city}
            onChange={(e) =>
              setField("city", sanitizePersonName(e.target.value))
            }
            className={cn(
              controlClass,
              errors.city ? "border-rose-400" : "border-border"
            )}
          />
          <FieldError message={errors.city} />
        </div>
        <div>
          <FieldLabel htmlFor={`${idPrefix}-state`} required>
            State
          </FieldLabel>
          <DownwardSelect
            id={`${idPrefix}-state`}
            value={value.state}
            onChange={(next) => setField("state", next)}
            options={US_STATE_OPTIONS}
            placeholder="Select state..."
            error={Boolean(errors.state)}
          />
          <FieldError message={errors.state} />
        </div>
      </div>

      <div>
        <FieldLabel htmlFor={`${idPrefix}-phone`} required>
          Cell Phone
        </FieldLabel>
        <input
          id={`${idPrefix}-phone`}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={CELL_PHONE_DIGITS}
          placeholder="10-digit number"
          value={value.phone}
          onChange={(e) =>
            setField(
              "phone",
              digitsOnly(e.target.value).slice(0, CELL_PHONE_DIGITS)
            )
          }
          className={cn(
            controlClass,
            errors.phone ? "border-rose-400" : "border-border"
          )}
        />
        <FieldError message={errors.phone} />
      </div>

      <div>
        <FieldLabel htmlFor={`${idPrefix}-employer`}>Employer</FieldLabel>
        <input
          id={`${idPrefix}-employer`}
          type="text"
          value={employerName || ""}
          readOnly
          className={cn(controlClass, "border-border bg-cream/40")}
        />
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
