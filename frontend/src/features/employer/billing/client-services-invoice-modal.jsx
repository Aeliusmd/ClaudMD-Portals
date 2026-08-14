"use client";

import { useEffect, useId } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const ORANGE = "#C45C26";

function formatMoney(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(amount || 0));
}

function MetaRow({ label, value }) {
  return (
    <div className="flex items-baseline justify-end gap-2 text-sm">
      <span className="font-semibold" style={{ color: ORANGE }}>
        {label}
      </span>
      <span className="min-w-[5.5rem] text-right font-medium tabular-nums text-ink">
        {value || ""}
      </span>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <p
      className="border-b border-current pb-0.5 text-sm font-semibold"
      style={{ color: ORANGE }}
    >
      {children}
    </p>
  );
}

export function ClientServicesInvoiceModal({ open, invoice, loading, error, onClose }) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-3 sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[min(48rem,94vh)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border/80 bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
          <h2 id={titleId} className="text-sm font-semibold text-ink sm:text-base">
            Invoice
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-cream hover:text-ink"
            aria-label="Close invoice"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#fafafa] p-3 sm:p-5">
          {loading ? (
            <div className="rounded-xl border border-border/70 bg-white px-5 py-10 text-sm text-muted">
              Loading invoice…
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-6 text-sm font-medium text-rose-700">
              {error}
            </div>
          ) : invoice ? (
            <div className="rounded-xl border border-border/70 bg-white px-4 py-5 shadow-sm sm:px-8 sm:py-7">
              <div className="relative mb-5">
                <h3 className="text-center text-xl font-bold tracking-wide text-ink sm:text-2xl">
                  {invoice.title || "CLIENT SERVICES BILLING"}
                </h3>
                <p className="absolute top-0 right-0 text-xs font-medium text-ink sm:text-sm">
                  {invoice.pageLabel || "Page 1 of 1"}
                </p>
              </div>

              <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1 text-sm text-ink">
                  {invoice.clinicName ? (
                    <p className="font-medium">{invoice.clinicName}</p>
                  ) : null}
                  {invoice.clinicAddress ? <p>{invoice.clinicAddress}</p> : null}
                  {invoice.clinicPhone ? <p>Phone: {invoice.clinicPhone}</p> : null}
                  {invoice.clinicFax ? <p>Fax: {invoice.clinicFax}</p> : null}
                </div>

                <div className="min-w-[14rem] space-y-2">
                  <MetaRow label="Date:" value={invoice.invoiceDate} />
                  <MetaRow label="Invoice#:" value={invoice.invoiceNumber} />
                  <MetaRow label="Tax ID:" value={invoice.taxId} />
                  <div className="mt-2 rounded-md border border-border/80 bg-[#f3f3f3] px-3 py-2.5">
                    <MetaRow
                      label="Amount Due:"
                      value={formatMoney(invoice.amountDue)}
                    />
                    <div className="mt-1">
                      <MetaRow label="Due Date:" value={invoice.dueDate} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mb-5 max-w-md space-y-1 text-sm text-ink">
                {invoice.employerName ? (
                  <p className="font-semibold underline decoration-ink/40 underline-offset-2">
                    {invoice.employerName}
                  </p>
                ) : null}
                {invoice.employerAddress ? <p>{invoice.employerAddress}</p> : null}
                {invoice.employerPhone ? <p>{invoice.employerPhone}</p> : null}
              </div>

              <div
                className="mb-5 grid gap-2 rounded-md px-3 py-2.5 text-sm sm:grid-cols-2 lg:grid-cols-4"
                style={{ backgroundColor: "rgba(196, 92, 38, 0.08)" }}
              >
                <p>
                  <span className="font-semibold" style={{ color: ORANGE }}>
                    Patient:{" "}
                  </span>
                  <span className="font-bold text-ink">
                    {invoice.patientName || "—"}
                  </span>
                </p>
                <p>
                  <span className="font-semibold" style={{ color: ORANGE }}>
                    SSN:{" "}
                  </span>
                  <span className="text-ink">{invoice.patientSsn || ""}</span>
                </p>
                <p>
                  <span className="font-semibold" style={{ color: ORANGE }}>
                    ACC#:{" "}
                  </span>
                  <span className="text-ink">{invoice.accountNo || ""}</span>
                </p>
                <p>
                  <span className="font-semibold" style={{ color: ORANGE }}>
                    OCC#:{" "}
                  </span>
                  <span className="text-ink">{invoice.occupation || ""}</span>
                </p>
              </div>

              <div className="mb-3">
                <SectionTitle>Services</SectionTitle>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[52rem] w-full border-collapse text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-border/80">
                      {[
                        "Exam Date",
                        "Code",
                        "Description of Service",
                        "Quantity",
                        "Unit Price",
                        "Charges",
                        "Payment",
                        "Adjust.",
                        "Balance",
                      ].map((label) => (
                        <th
                          key={label}
                          className={cn(
                            "px-2 py-2 font-semibold",
                            ["Quantity", "Unit Price", "Charges", "Payment", "Adjust.", "Balance"].includes(
                              label
                            ) && "text-right"
                          )}
                          style={{ color: ORANGE }}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(invoice.lines || []).length === 0 ? (
                      <tr>
                        <td
                          colSpan={9}
                          className="px-2 py-6 text-center text-muted"
                        >
                          No service lines on this invoice.
                        </td>
                      </tr>
                    ) : (
                      invoice.lines.map((line) => (
                        <tr key={line.id} className="border-b border-border/50">
                          <td className="px-2 py-2 tabular-nums text-ink">
                            {line.examDate || "—"}
                          </td>
                          <td className="px-2 py-2 tabular-nums text-ink">
                            {line.code || ""}
                          </td>
                          <td className="px-2 py-2 text-ink">
                            {line.description || "—"}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-ink">
                            {line.quantity}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-ink">
                            {Number(line.unitPrice || 0).toFixed(2)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-ink">
                            {formatMoney(line.charges)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-ink">
                            {line.payment ? formatMoney(line.payment) : ""}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-ink">
                            {line.adjust ? formatMoney(line.adjust) : ""}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-ink">
                            {formatMoney(line.balance)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex items-center justify-end gap-4 border-t-2 border-border/80 pt-3">
                <span className="text-sm font-bold" style={{ color: ORANGE }}>
                  TOTAL DUE
                </span>
                <span className="text-base font-bold tabular-nums text-ink">
                  {formatMoney(invoice.totalDue)}
                </span>
              </div>

              <div className="mt-6 space-y-4">
                <div>
                  <SectionTitle>Diagnosis</SectionTitle>
                  <p className="mt-2 text-sm text-ink">
                    {(invoice.diagnosis || []).join(", ") || ""}
                  </p>
                </div>
                <div>
                  <SectionTitle>Provider</SectionTitle>
                  <p className="mt-2 text-sm font-medium text-ink">
                    {invoice.providerName || ""}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
