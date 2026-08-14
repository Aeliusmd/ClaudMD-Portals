"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock3, Download, FileText, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { SkeletonBlock, TableSkeleton } from "@/components/ui/skeleton";
import { employerPaidBills } from "@/data/employer-billing";
import { ClientServicesInvoiceModal } from "@/features/employer/billing/client-services-invoice-modal";
import { MakePaymentModal } from "@/features/employer/billing/make-payment-modal";
import {
  fetchEmployerBillInvoice,
  fetchEmployerBillReview,
} from "@/lib/api/employer";
import { getAccessToken } from "@/lib/auth-session";
import { EMPLOYER_LOGIN_PATH } from "@/lib/portal-paths";
import { cn } from "@/lib/utils";

function formatMoney(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function matchesReviewQuery(bill, query) {
  const haystack = [bill.patientName, bill.accountNo, bill.visit, bill.dos]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function matchesPaidQuery(bill, query) {
  const haystack = [
    bill.invoiceNo,
    bill.patientName,
    bill.description,
    bill.category,
    bill.paidOn,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function OverviewCard({ label, value, detail, icon, iconWrap, featured = false }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl p-4 shadow-sm sm:p-5",
        featured
          ? "bg-primary-800 text-white"
          : "border border-border/70 bg-white"
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          iconWrap
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p
          className={cn(
            "text-[10px] font-semibold tracking-[0.14em] uppercase sm:text-[11px]",
            featured ? "text-white/70" : "text-muted"
          )}
        >
          {label}
        </p>
        <p
          className={cn(
            "mt-2 font-sans text-3xl font-semibold tabular-nums leading-none sm:text-4xl",
            featured ? "text-white" : "text-ink"
          )}
        >
          {value}
        </p>
        <p className={cn("mt-2 text-sm", featured ? "text-white/70" : "text-muted")}>
          {detail}
        </p>
      </div>
    </div>
  );
}

export function EmployerBillingView() {
  const router = useRouter();
  const [tab, setTab] = useState("review");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [message, setMessage] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState(null);
  const [invoice, setInvoice] = useState(null);

  const [reviewBills, setReviewBills] = useState([]);
  const [payableCount, setPayableCount] = useState(0);
  const [outstandingTotal, setOutstandingTotal] = useState(0);
  const [reviewLoading, setReviewLoading] = useState(true);
  const [reviewError, setReviewError] = useState(null);

  const paidTotal = useMemo(
    () => employerPaidBills.reduce((sum, bill) => sum + bill.amount, 0),
    []
  );

  useEffect(() => {
    if (tab !== "review") return undefined;

    let cancelled = false;

    async function loadReview() {
      const token = getAccessToken();
      if (!token) {
        router.replace(EMPLOYER_LOGIN_PATH);
        return;
      }

      setReviewLoading(true);
      try {
        const data = await fetchEmployerBillReview(token);
        if (cancelled) return;
        setReviewBills(data.items);
        setPayableCount(data.payableCount);
        setOutstandingTotal(data.outstandingTotal);
        setReviewError(null);
        setSelectedIds(new Set());
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 401) {
          router.replace(EMPLOYER_LOGIN_PATH);
          return;
        }
        setReviewError(err?.message || "Unable to load bill review.");
        setReviewBills([]);
        setPayableCount(0);
        setOutstandingTotal(0);
      } finally {
        if (!cancelled) setReviewLoading(false);
      }
    }

    loadReview();
    return () => {
      cancelled = true;
    };
  }, [router, tab]);

  const filteredReview = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return reviewBills;
    return reviewBills.filter((bill) => matchesReviewQuery(bill, normalized));
  }, [reviewBills, query]);

  const filteredPaid = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return employerPaidBills;
    return employerPaidBills.filter((bill) => matchesPaidQuery(bill, normalized));
  }, [query]);

  const selectedBills = filteredReview.filter((bill) => selectedIds.has(bill.id));
  const selectedTotal = selectedBills.reduce((sum, bill) => sum + bill.amount, 0);
  const allVisibleSelected =
    filteredReview.length > 0 &&
    filteredReview.every((bill) => selectedIds.has(bill.id));

  function toggleAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredReview.forEach((bill) => next.delete(bill.id));
      } else {
        filteredReview.forEach((bill) => next.add(bill.id));
      }
      return next;
    });
  }

  function toggleRow(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function switchTab(nextTab) {
    setTab(nextTab);
    setQuery("");
    setSelectedIds(new Set());
    setMessage("");
    setPaymentOpen(false);
    setInvoiceOpen(false);
    setInvoice(null);
    setInvoiceError(null);
  }

  function handlePay() {
    if (!selectedBills.length) return;
    setMessage("");
    setPaymentOpen(true);
  }

  function handlePaymentSubmit({ method, total, bills }) {
    const methodLabel = method === "bank" ? "bank account" : "card";
    setPaymentOpen(false);
    setSelectedIds(new Set());
    setMessage(
      `Payment submitted for ${bills.length} bill${
        bills.length === 1 ? "" : "s"
      } totaling ${formatMoney(total)} via ${methodLabel}. (Checkout UI only — not charged yet.)`
    );
  }

  async function handleInvoice(bill) {
    if (!bill?.billingHeaderId) return;
    const token = getAccessToken();
    if (!token) {
      router.replace(EMPLOYER_LOGIN_PATH);
      return;
    }

    setMessage("");
    setInvoiceOpen(true);
    setInvoiceLoading(true);
    setInvoiceError(null);
    setInvoice(null);
    try {
      const detail = await fetchEmployerBillInvoice(token, bill.billingHeaderId);
      setInvoice(detail);
    } catch (err) {
      if (err?.status === 401) {
        router.replace(EMPLOYER_LOGIN_PATH);
        return;
      }
      setInvoiceError(err?.message || "Unable to load invoice.");
    } finally {
      setInvoiceLoading(false);
    }
  }

  function handleDownload(bill) {
    setMessage(`Demo download — ${bill.invoiceNo}.`);
  }

  return (
    <div className="space-y-5">
      <MakePaymentModal
        open={paymentOpen}
        bills={selectedBills}
        onClose={() => setPaymentOpen(false)}
        onSubmit={handlePaymentSubmit}
      />
      <ClientServicesInvoiceModal
        open={invoiceOpen}
        invoice={invoice}
        loading={invoiceLoading}
        error={invoiceError}
        onClose={() => {
          setInvoiceOpen(false);
          setInvoice(null);
          setInvoiceError(null);
        }}
      />
      <PageHeader
        title="Billing"
        className="mb-0"
        actions={
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => switchTab("review")}
                className={cn(
                  "inline-flex cursor-pointer items-center rounded-full px-4 py-2.5 text-sm font-semibold transition-colors",
                  tab === "review"
                    ? "bg-primary text-white shadow-sm"
                    : "bg-cream-deep text-ink hover:bg-border"
                )}
              >
                Bill Review
              </button>
              <button
                type="button"
                onClick={() => switchTab("paid")}
                className={cn(
                  "inline-flex cursor-pointer items-center rounded-full px-4 py-2.5 text-sm font-semibold transition-colors",
                  tab === "paid"
                    ? "bg-primary text-white shadow-sm"
                    : "bg-cream-deep text-ink hover:bg-border"
                )}
              >
                Paid Bills
              </button>
              {tab === "paid" ? (
                <span className="inline-flex rounded-full bg-cream-deep px-3 py-2 text-xs font-semibold tabular-nums text-ink">
                  Total paid: {formatMoney(paidTotal)}
                </span>
              ) : null}
            </div>
            {tab === "review" ? (
              <p className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Live summary
              </p>
            ) : null}
          </div>
        }
      />

      {tab === "review" ? (
        <>
          <div>
            <h2 className="text-lg font-semibold text-ink">Billing Overview</h2>
            <p className="mt-1 text-sm text-muted">
              Physical-category bills for your organization with an open balance.
            </p>
          </div>

          {reviewLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-busy="true">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-2xl border border-border/70 bg-white p-5"
                >
                  <SkeletonBlock className="h-3 w-24" />
                  <SkeletonBlock className="mt-3 h-9 w-32" />
                  <SkeletonBlock className="mt-3 h-3 w-40" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <OverviewCard
                featured
                label="Total Outstanding"
                value={formatMoney(outstandingTotal)}
                detail={`${payableCount} bills with a balance`}
                iconWrap="bg-white/15 text-white"
                icon={<Receipt className="h-5 w-5" />}
              />
              <OverviewCard
                label="Payable bills"
                value={payableCount}
                detail="Ready for payment"
                iconWrap="bg-primary-50 text-primary"
                icon={<FileText className="h-5 w-5" />}
              />
              <OverviewCard
                label="Total bills"
                value={reviewBills.length}
                detail="In bill review"
                iconWrap="bg-cream-deep text-foreground-700"
                icon={<Clock3 className="h-5 w-5" />}
              />
            </div>
          )}
        </>
      ) : (
        <div>
          <h2 className="text-lg font-semibold text-ink">Paid Bills</h2>
          <p className="mt-1 text-sm text-muted">
            Complete payment history for your organization.
          </p>
        </div>
      )}

      <SearchInput
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={
          tab === "paid"
            ? "Search by patient, invoice, or description..."
            : "Search by name, acct #, or visit..."
        }
        ariaLabel={tab === "paid" ? "Search paid bills" : "Search bills"}
      />

      {message ? (
        <p className="rounded-xl border border-primary-100 bg-primary-50 px-4 py-3 text-sm text-primary-800">
          {message}
        </p>
      ) : null}

      {tab === "review" ? (
        <Card className="overflow-hidden p-0">
          {reviewLoading ? (
            <div className="px-5 py-5">
              <TableSkeleton rows={5} columns={6} />
            </div>
          ) : reviewError ? (
            <div className="px-5 py-8 text-sm font-medium text-rose-700">
              {reviewError}
            </div>
          ) : filteredReview.length === 0 ? (
            <EmptyState
              title="No bills found"
              description={
                query.trim()
                  ? "Try another search or clear the filter."
                  : "No Physical-category bills with an open balance for your organization."
              }
              className="min-h-64 rounded-none border-0"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[48rem] w-full text-left text-sm">
                <thead className="border-y border-border/70 bg-cream/50 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                  <tr>
                    <th className="w-12 px-4 py-3 sm:px-5">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleAllVisible}
                        aria-label="Select all visible bills"
                        className="h-4 w-4 cursor-pointer accent-primary"
                      />
                    </th>
                    <th className="px-4 py-3 sm:px-5">DOS</th>
                    <th className="px-4 py-3 sm:px-5">Acct. #</th>
                    <th className="px-4 py-3 sm:px-5">Patient Name</th>
                    <th className="px-4 py-3 sm:px-5">Visit</th>
                    <th className="px-4 py-3 text-right sm:px-5">Amount</th>
                    <th className="px-4 py-3 text-center sm:px-5">Invoice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredReview.map((bill) => {
                    const checked = selectedIds.has(bill.id);
                    return (
                      <tr
                        key={bill.id}
                        className={cn(
                          "bg-white transition",
                          checked ? "bg-primary-50" : "hover:bg-cream/40"
                        )}
                      >
                        <td className="px-4 py-3.5 sm:px-5 sm:py-4">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleRow(bill.id)}
                            aria-label={`Select ${bill.patientName}`}
                            className="h-4 w-4 cursor-pointer accent-primary"
                          />
                        </td>
                        <td className="px-4 py-3.5 tabular-nums text-ink sm:px-5 sm:py-4">
                          {bill.dos}
                        </td>
                        <td className="px-4 py-3.5 tabular-nums text-muted sm:px-5 sm:py-4">
                          {bill.accountNo}
                        </td>
                        <td className="px-4 py-3.5 font-semibold text-ink sm:px-5 sm:py-4">
                          {bill.patientName}
                        </td>
                        <td className="px-4 py-3.5 sm:px-5 sm:py-4">
                          <Badge className="bg-secondary-100 text-secondary-700">
                            {bill.visit}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-ink sm:px-5 sm:py-4">
                          {formatMoney(bill.amount)}
                        </td>
                        <td className="px-4 py-3.5 text-center sm:px-5 sm:py-4">
                          <button
                            type="button"
                            onClick={() => handleInvoice(bill)}
                            aria-label={`Open invoice for ${bill.patientName}`}
                            className="inline-flex cursor-pointer rounded-lg p-1.5 text-primary hover:bg-primary-50"
                          >
                            <FileText className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-border/70 bg-cream/40 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-sm font-medium text-ink">
              {selectedBills.length} selected
              {selectedBills.length > 0 ? ` — ${formatMoney(selectedTotal)}` : ""}
            </p>
            <Button onClick={handlePay} disabled={selectedBills.length === 0}>
              Pay {selectedBills.length > 0 ? formatMoney(selectedTotal) : ""}
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          {filteredPaid.length === 0 ? (
            <EmptyState
              title="No paid bills found"
              description="Try another search, or switch back to Bill Review."
              className="min-h-64 rounded-none border-0"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[56rem] w-full text-left text-sm">
                <thead className="border-y border-border/70 bg-cream/50 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                  <tr>
                    <th className="px-4 py-3 sm:px-5">Invoice #</th>
                    <th className="px-4 py-3 sm:px-5">Patient</th>
                    <th className="px-4 py-3 sm:px-5">Description</th>
                    <th className="px-4 py-3 sm:px-5">Paid On</th>
                    <th className="px-4 py-3 text-right sm:px-5">Amount</th>
                    <th className="px-4 py-3 sm:px-5">Status</th>
                    <th className="px-4 py-3 text-center sm:px-5">Invoice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredPaid.map((bill) => (
                    <tr key={bill.id} className="bg-white transition hover:bg-cream/40">
                      <td className="px-4 py-3.5 font-semibold tabular-nums text-ink sm:px-5 sm:py-4">
                        {bill.invoiceNo}
                      </td>
                      <td className="px-4 py-3.5 text-ink sm:px-5 sm:py-4">
                        {bill.patientName || "—"}
                      </td>
                      <td className="px-4 py-3.5 sm:px-5 sm:py-4">
                        <p className="font-semibold text-ink">{bill.description}</p>
                        <p className="mt-0.5 text-xs text-muted">{bill.category}</p>
                      </td>
                      <td className="px-4 py-3.5 text-ink sm:px-5 sm:py-4">
                        {bill.paidOn}
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-ink sm:px-5 sm:py-4">
                        {formatMoney(bill.amount)}
                      </td>
                      <td className="px-4 py-3.5 sm:px-5 sm:py-4">
                        <Badge className="gap-1 bg-secondary-100 text-secondary-700">
                          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                          Paid
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 text-center sm:px-5 sm:py-4">
                        <button
                          type="button"
                          onClick={() => handleDownload(bill)}
                          aria-label={`Download ${bill.invoiceNo}`}
                          className="inline-flex cursor-pointer rounded-lg p-1.5 text-primary hover:bg-primary-50"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
