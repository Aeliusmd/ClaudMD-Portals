"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  Building2,
  CreditCard,
  Lock,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatMoney(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function FieldLabel({ children, htmlFor }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-[11px] font-semibold tracking-[0.08em] text-[#8B6D4F] uppercase"
    >
      {children}
    </label>
  );
}

function TextInput({
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
  inputMode,
  maxLength,
  error,
}) {
  return (
    <>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted/70",
          "focus:border-primary focus:ring-2 focus:ring-primary/15",
          error ? "border-rose-300" : "border-border/80"
        )}
      />
      {error ? (
        <p className="mt-1 text-xs font-medium text-rose-700">{error}</p>
      ) : null}
    </>
  );
}

function SegmentedControl({ options, value, onChange, tone = "primary" }) {
  const activeClass =
    tone === "green"
      ? "bg-emerald-700 text-white shadow-sm"
      : "bg-primary text-white shadow-sm";

  return (
    <div className="flex rounded-xl bg-cream-deep p-1">
      {options.map((option) => {
        const Icon = option.icon;
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
              active ? activeClass : "text-ink hover:bg-white/60"
            )}
          >
            {Icon ? <Icon className="h-4 w-4" /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatCardNumber(value) {
  const digits = digitsOnly(value).slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function formatExpiry(value) {
  const digits = digitsOnly(value).slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function billLineLabel(bill) {
  if (bill.patientName) {
    const visit = bill.visit && bill.visit !== "—" ? bill.visit : null;
    return visit ? `${bill.patientName} — ${visit}` : bill.patientName;
  }
  const left = bill.provider || bill.incidentNo || "Bill";
  const right = bill.visit || bill.incident || null;
  return right ? `${left} — ${right}` : left;
}

const EMPTY_CARD = {
  cardholderName: "",
  cardNumber: "",
  expiry: "",
  cvc: "",
};

const EMPTY_BANK = {
  accountHolderName: "",
  accountType: "checking",
  routingNumber: "",
  accountNumber: "",
  confirmAccountNumber: "",
};

export function MakePaymentModal({ open, bills, onClose, onSubmit }) {
  const titleId = useId();
  const [method, setMethod] = useState("card");
  const [card, setCard] = useState(EMPTY_CARD);
  const [bank, setBank] = useState(EMPTY_BANK);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const total = useMemo(
    () => (bills || []).reduce((sum, bill) => sum + Number(bill.amount || 0), 0),
    [bills]
  );

  useEffect(() => {
    if (!open) return undefined;
    setMethod("card");
    setCard(EMPTY_CARD);
    setBank(EMPTY_BANK);
    setErrors({});
    setSubmitting(false);

    function onKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  function validate() {
    const next = {};
    if (method === "card") {
      if (!card.cardholderName.trim()) {
        next.cardholderName = "Enter the cardholder name.";
      }
      const number = digitsOnly(card.cardNumber);
      if (number.length < 13 || number.length > 16) {
        next.cardNumber = "Enter a valid card number.";
      }
      const expiryDigits = digitsOnly(card.expiry);
      if (expiryDigits.length !== 4) {
        next.expiry = "Enter expiry as MM/YY.";
      } else {
        const month = Number(expiryDigits.slice(0, 2));
        if (month < 1 || month > 12) next.expiry = "Enter a valid month.";
      }
      const cvc = digitsOnly(card.cvc);
      if (cvc.length < 3 || cvc.length > 4) {
        next.cvc = "Enter a valid CVC.";
      }
    } else {
      if (!bank.accountHolderName.trim()) {
        next.accountHolderName = "Enter the account holder name.";
      }
      const routing = digitsOnly(bank.routingNumber);
      if (routing.length !== 9) {
        next.routingNumber = "Routing number must be 9 digits.";
      }
      const account = digitsOnly(bank.accountNumber);
      if (account.length < 4) {
        next.accountNumber = "Enter a valid account number.";
      }
      if (digitsOnly(bank.confirmAccountNumber) !== account) {
        next.confirmAccountNumber = "Account numbers must match.";
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting || !bills?.length) return;
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onSubmit?.({
        method,
        total,
        bills,
        card: method === "card" ? card : null,
        bank: method === "bank" ? bank : null,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[min(40rem,92vh)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border/80 bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-ink">
            Make Payment
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-cream hover:text-ink"
            aria-label="Close payment modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={handleSubmit}
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
            <div className="rounded-2xl bg-cream/80 px-4 py-3.5">
              <p className="text-[11px] font-semibold tracking-[0.08em] text-[#8B6D4F] uppercase">
                Paying ({bills.length})
              </p>
              <ul className="mt-3 space-y-2">
                {bills.map((bill) => (
                  <li
                    key={bill.id}
                    className="flex items-start justify-between gap-3 text-sm"
                  >
                    <span className="min-w-0 font-medium text-ink">
                      {billLineLabel(bill)}
                    </span>
                    <span className="shrink-0 tabular-nums font-semibold text-ink">
                      {formatMoney(bill.amount)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-3">
                <span className="text-sm font-medium text-ink">Total</span>
                <span className="text-base font-semibold tabular-nums text-ink">
                  {formatMoney(total)}
                </span>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-[#8B6D4F] uppercase">
                Payment method
              </p>
              <SegmentedControl
                value={method}
                onChange={(next) => {
                  setMethod(next);
                  setErrors({});
                }}
                options={[
                  { value: "card", label: "Card", icon: CreditCard },
                  { value: "bank", label: "Bank Account", icon: Building2 },
                ]}
              />
            </div>

            {method === "card" ? (
              <div className="space-y-4">
                <div>
                  <FieldLabel htmlFor="pay-cardholder">Cardholder name</FieldLabel>
                  <TextInput
                    id="pay-cardholder"
                    value={card.cardholderName}
                    placeholder="Name on card"
                    autoComplete="cc-name"
                    error={errors.cardholderName}
                    onChange={(value) =>
                      setCard((prev) => ({ ...prev, cardholderName: value }))
                    }
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="pay-card-number">Card number</FieldLabel>
                  <TextInput
                    id="pay-card-number"
                    value={card.cardNumber}
                    placeholder="1234 5678 9012 3456"
                    autoComplete="cc-number"
                    inputMode="numeric"
                    error={errors.cardNumber}
                    onChange={(value) =>
                      setCard((prev) => ({
                        ...prev,
                        cardNumber: formatCardNumber(value),
                      }))
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel htmlFor="pay-expiry">Expiry</FieldLabel>
                    <TextInput
                      id="pay-expiry"
                      value={card.expiry}
                      placeholder="MM/YY"
                      autoComplete="cc-exp"
                      inputMode="numeric"
                      error={errors.expiry}
                      onChange={(value) =>
                        setCard((prev) => ({
                          ...prev,
                          expiry: formatExpiry(value),
                        }))
                      }
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="pay-cvc">CVC</FieldLabel>
                    <TextInput
                      id="pay-cvc"
                      value={card.cvc}
                      placeholder="123"
                      autoComplete="cc-csc"
                      inputMode="numeric"
                      maxLength={4}
                      error={errors.cvc}
                      onChange={(value) =>
                        setCard((prev) => ({
                          ...prev,
                          cvc: digitsOnly(value).slice(0, 4),
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <FieldLabel htmlFor="pay-account-holder">
                    Account holder name
                  </FieldLabel>
                  <TextInput
                    id="pay-account-holder"
                    value={bank.accountHolderName}
                    placeholder="Name on account"
                    autoComplete="name"
                    error={errors.accountHolderName}
                    onChange={(value) =>
                      setBank((prev) => ({
                        ...prev,
                        accountHolderName: value,
                      }))
                    }
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-[#8B6D4F] uppercase">
                    Account type
                  </p>
                  <SegmentedControl
                    tone="green"
                    value={bank.accountType}
                    onChange={(value) =>
                      setBank((prev) => ({ ...prev, accountType: value }))
                    }
                    options={[
                      { value: "checking", label: "Checking" },
                      { value: "savings", label: "Savings" },
                    ]}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="pay-routing">Routing number</FieldLabel>
                  <TextInput
                    id="pay-routing"
                    value={bank.routingNumber}
                    placeholder="9-digit routing number"
                    inputMode="numeric"
                    maxLength={9}
                    error={errors.routingNumber}
                    onChange={(value) =>
                      setBank((prev) => ({
                        ...prev,
                        routingNumber: digitsOnly(value).slice(0, 9),
                      }))
                    }
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="pay-account">Account number</FieldLabel>
                  <TextInput
                    id="pay-account"
                    value={bank.accountNumber}
                    placeholder="Account number"
                    inputMode="numeric"
                    error={errors.accountNumber}
                    onChange={(value) =>
                      setBank((prev) => ({
                        ...prev,
                        accountNumber: digitsOnly(value).slice(0, 17),
                      }))
                    }
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="pay-confirm-account">
                    Confirm account number
                  </FieldLabel>
                  <TextInput
                    id="pay-confirm-account"
                    value={bank.confirmAccountNumber}
                    placeholder="Re-enter account number"
                    inputMode="numeric"
                    error={errors.confirmAccountNumber}
                    onChange={(value) =>
                      setBank((prev) => ({
                        ...prev,
                        confirmAccountNumber: digitsOnly(value).slice(0, 17),
                      }))
                    }
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-border/60 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
              <Lock className="h-3.5 w-3.5" />
              Secured checkout
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !bills?.length}>
                {submitting ? "Processing…" : `Pay ${formatMoney(total)}`}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
