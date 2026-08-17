"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, CreditCard, Download, FileText, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  PAGE_SIZE,
  Pagination,
  paginateItems,
} from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { SkeletonBlock, TableSkeleton } from "@/components/ui/skeleton";
import { MakePaymentModal } from "@/features/employer/billing/make-payment-modal";
import { ClientServicesInvoiceModal } from "@/features/employer/billing/client-services-invoice-modal";
import { usePatientProfile } from "@/hooks/use-patient-profile";
import {
  fetchPatientBillInvoice,
  fetchPatientBillReview,
  fetchPatientPaidBills,
} from "@/lib/api/patient";
import { getAccessToken } from "@/lib/auth-session";
import { patientPaths } from "@/lib/portal-paths";
import { displayFullName } from "@/lib/profile-display";
import { cn } from "@/lib/utils";

function formatMoney(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function matchesReviewQuery(bill, query) {
  const haystack = [
    bill.incidentNo,
    bill.incident,
    bill.provider,
    bill.insurance,
    bill.visit,
    bill.doi,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

export function PatientBillingView() {
  const router = useRouter();
  const { profile } = usePatientProfile();
  const [tab, setTab] = useState("review");
  const [query, setQuery] = useState("");
  const [appliedReviewSearch, setAppliedReviewSearch] = useState("");
  const [reviewPage, setReviewPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [message, setMessage] = useState("");
  const [transientMessageId, setTransientMessageId] = useState(0);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState(null);
  const [invoice, setInvoice] = useState(null);
  const [invoiceDownloadRequested, setInvoiceDownloadRequested] = useState(false);

  const [reviewBills, setReviewBills] = useState([]);
  const [summary, setSummary] = useState({
    urgentCareCount: 0,
    urgentCareTotal: 0,
    personalInjuryCount: 0,
    personalInjuryTotal: 0,
    outstandingTotal: 0,
  });
  const [reviewLoading, setReviewLoading] = useState(true);
  const [reviewError, setReviewError] = useState(null);

  const [paidBills, setPaidBills] = useState([]);
  const [paidTotal, setPaidTotal] = useState(0);
  const [paidLoading, setPaidLoading] = useState(false);
  const [paidError, setPaidError] = useState(null);

  const patientName = displayFullName(profile) || "there";

  useEffect(() => {
    if (!transientMessageId) return undefined;
    const timer = window.setTimeout(() => setMessage(""), 10000);
    return () => window.clearTimeout(timer);
  }, [transientMessageId]);

  useEffect(() => {
    let cancelled = false;

    async function loadReview() {
      const token = getAccessToken();
      if (!token) {
        router.replace(patientPaths.login);
        return;
      }
      setReviewLoading(true);
      setReviewError(null);
      try {
        const data = await fetchPatientBillReview(token);
        if (cancelled) return;
        setReviewBills(data.items);
        setSummary({
          urgentCareCount: data.urgentCareCount,
          urgentCareTotal: data.urgentCareTotal,
          personalInjuryCount: data.personalInjuryCount,
          personalInjuryTotal: data.personalInjuryTotal,
          outstandingTotal: data.outstandingTotal,
        });
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 401) {
          router.replace(patientPaths.login);
          return;
        }
        setReviewError(err?.message || "Unable to load bill review.");
        setReviewBills([]);
      } finally {
        if (!cancelled) setReviewLoading(false);
      }
    }

    loadReview();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (tab !== "paid") return undefined;
    let cancelled = false;

    async function loadPaid() {
      const token = getAccessToken();
      if (!token) {
        router.replace(patientPaths.login);
        return;
      }
      setPaidLoading(true);
      setPaidError(null);
      try {
        const data = await fetchPatientPaidBills(token, {
          page: 1,
          pageSize: 50,
          search: query,
        });
        if (cancelled) return;
        setPaidBills(data.items);
        setPaidTotal(data.totalPaid);
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 401) {
          router.replace(patientPaths.login);
          return;
        }
        setPaidError(err?.message || "Unable to load paid bills.");
        setPaidBills([]);
        setPaidTotal(0);
      } finally {
        if (!cancelled) setPaidLoading(false);
      }
    }

    const timer = window.setTimeout(loadPaid, query.trim() ? 250 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tab, query, router]);

  const filteredReview = useMemo(() => {
    const normalized = appliedReviewSearch.trim().toLowerCase();
    if (!normalized) return reviewBills;
    return reviewBills.filter((bill) => matchesReviewQuery(bill, normalized));
  }, [reviewBills, appliedReviewSearch]);

  const pagedReview = useMemo(
    () => paginateItems(filteredReview, reviewPage, PAGE_SIZE),
    [filteredReview, reviewPage]
  );

  const selectedBills = filteredReview.filter((bill) => selectedIds.has(bill.id));
  const selectedTotal = selectedBills.reduce((sum, bill) => sum + bill.amount, 0);
  const allVisibleSelected =
    pagedReview.items.length > 0 &&
    pagedReview.items.every((bill) => selectedIds.has(bill.id));

  function switchTab(nextTab) {
    setTab(nextTab);
    setQuery("");
    setAppliedReviewSearch("");
    setReviewPage(1);
    setSelectedIds(new Set());
    setMessage("");
    setPaymentOpen(false);
    setInvoiceOpen(false);
    setInvoice(null);
    setInvoiceError(null);
    setInvoiceDownloadRequested(false);
  }

  function applyReviewSearch() {
    setAppliedReviewSearch(query);
    setReviewPage(1);
  }

  function toggleRow(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        pagedReview.items.forEach((bill) => next.delete(bill.id));
      } else {
        pagedReview.items.forEach((bill) => next.add(bill.id));
      }
      return next;
    });
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

  async function handleInvoice(bill, { download = false } = {}) {
    if (!bill?.billingHeaderId) return;
    const token = getAccessToken();
    if (!token) {
      router.replace(patientPaths.login);
      return;
    }

    setMessage("");
    setInvoiceOpen(!download);
    setInvoiceLoading(true);
    setInvoiceError(null);
    setInvoice(null);
    setInvoiceDownloadRequested(download);
    try {
      const detail = await fetchPatientBillInvoice(
        token,
        bill.billingHeaderId,
        download ? bill.historyId : null
      );
      setInvoice(detail);
    } catch (err) {
      if (err?.status === 401) {
        router.replace(patientPaths.login);
        return;
      }
      const errorMessage = err?.message || "Unable to load invoice.";
      setInvoiceError(errorMessage);
      if (download) {
        setInvoiceDownloadRequested(false);
        setMessage(errorMessage);
      }
    } finally {
      setInvoiceLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <MakePaymentModal
        open={paymentOpen}
        bills={selectedBills}
        onClose={() => setPaymentOpen(false)}
        onSubmit={handlePaymentSubmit}
      />
      <ClientServicesInvoiceModal
        open={invoiceOpen || invoiceDownloadRequested}
        invoice={invoice}
        loading={invoiceLoading}
        error={invoiceError}
        downloadOnLoad={invoiceDownloadRequested}
        onDownloadComplete={(downloadError) => {
          setInvoiceDownloadRequested(false);
          setInvoice(null);
          if (downloadError) {
            setMessage(downloadError.message || "Unable to download invoice.");
            return;
          }
          setMessage("Invoice PDF downloaded.");
          setTransientMessageId((id) => id + 1);
        }}
        onClose={() => {
          setInvoiceOpen(false);
          setInvoice(null);
          setInvoiceError(null);
          setInvoiceDownloadRequested(false);
        }}
      />
      <PageHeader
        title="Billing"
        description={`Hello, ${patientName} — here’s a summary of your medical bills.`}
        className="mb-0"
        actions={
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
          </div>
        }
      />

      {tab === "review" ? (
        reviewLoading ? (
          <div className="overflow-hidden rounded-2xl border border-border/70 bg-white p-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index}>
                  <SkeletonBlock className="h-3 w-24" />
                  <SkeletonBlock className="mt-3 h-9 w-28" />
                  <SkeletonBlock className="mt-3 h-3 w-20" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-primary-800 text-white shadow-sm">
            <div className="grid grid-cols-1 divide-y divide-white/15 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="px-5 py-5 sm:px-6 sm:py-6">
                <p className="text-[11px] font-semibold tracking-[0.14em] text-white/70 uppercase">
                  Urgent Care
                </p>
                <p className="mt-2 font-sans text-4xl font-semibold tabular-nums leading-none">
                  {summary.urgentCareCount}
                </p>
                <p className="mt-2 text-sm text-white/80">
                  {formatMoney(summary.urgentCareTotal)}
                </p>
              </div>
              <div className="px-5 py-5 sm:px-6 sm:py-6">
                <p className="text-[11px] font-semibold tracking-[0.14em] text-white/70 uppercase">
                  Personal Injury
                </p>
                <p className="mt-2 font-sans text-4xl font-semibold tabular-nums leading-none">
                  {summary.personalInjuryCount}
                </p>
                <p className="mt-2 text-sm text-white/80">
                  {formatMoney(summary.personalInjuryTotal)}
                </p>
              </div>
              <div className="px-5 py-5 sm:px-6 sm:py-6">
                <p className="text-[11px] font-semibold tracking-[0.14em] text-white/70 uppercase">
                  Outstanding
                </p>
                <p className="mt-2 font-sans text-4xl font-semibold tabular-nums leading-none">
                  {formatMoney(summary.outstandingTotal)}
                </p>
                <p className="mt-2 text-sm text-white/80">Total due</p>
              </div>
            </div>
          </div>
        )
      ) : (
        <div>
          <h2 className="text-lg font-semibold text-ink">Paid Bills</h2>
          <p className="mt-1 text-sm text-muted">Your complete payment history</p>
        </div>
      )}

      <div
        className={cn(
          "flex flex-col gap-3",
          tab === "paid" && "sm:flex-row sm:items-center"
        )}
      >
        {tab === "paid" ? (
          <span className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-secondary-200 bg-secondary-50 px-3.5 py-2 text-xs font-semibold text-secondary-700">
            <span className="h-1.5 w-1.5 rounded-full bg-secondary-500" />
            Total paid {formatMoney(paidTotal)}
          </span>
        ) : null}
        <form
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (tab === "review") applyReviewSearch();
          }}
        >
          <SearchInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onClear={
              tab === "review"
                ? () => {
                    setAppliedReviewSearch("");
                    setReviewPage(1);
                  }
                : undefined
            }
            placeholder={
              tab === "paid"
                ? "Search by provider, incident, or invoice..."
                : "Search by provider, insurance, incident, or incident #..."
            }
            ariaLabel={tab === "paid" ? "Search paid bills" : "Search bills"}
            className="min-w-0 flex-1"
          />
          {tab === "review" ? (
            <Button
              type="submit"
              className="h-[3.15rem] shrink-0 rounded-2xl px-5"
            >
              <Search className="h-4 w-4" />
              Search
            </Button>
          ) : null}
        </form>
      </div>

      {message ? (
        <p className="rounded-xl border border-primary-100 bg-primary-50 px-4 py-3 text-sm text-primary-800">
          {message}
        </p>
      ) : null}

      {tab === "review" ? (
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-border/70 px-4 py-3.5 sm:px-5">
            <h3 className="text-sm font-semibold text-ink">Bills</h3>
            <p className="text-xs font-medium text-muted">
              {filteredReview.length} bill{filteredReview.length === 1 ? "" : "s"}
            </p>
          </div>

          {reviewLoading ? (
            <div className="px-5 py-5">
              <TableSkeleton rows={5} columns={8} />
            </div>
          ) : reviewError ? (
            <div className="px-5 py-8 text-sm font-medium text-rose-700">
              {reviewError}
            </div>
          ) : filteredReview.length === 0 ? (
            <EmptyState
              title="No bills found"
              description={
                appliedReviewSearch.trim()
                  ? "Try another search or clear the filter."
                  : "No Urgent Care or Personal Injury bills with an open balance."
              }
              className="min-h-64 rounded-none border-0"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[56rem] w-full text-left text-sm">
                <thead className="border-b border-border/70 bg-cream/50 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
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
                    <th className="px-4 py-3 sm:px-5">Incident #</th>
                    <th className="px-4 py-3 sm:px-5">Incident</th>
                    <th className="px-4 py-3 sm:px-5">Provider</th>
                    <th className="px-4 py-3 sm:px-5">Insurance</th>
                    <th className="px-4 py-3 sm:px-5">Visit</th>
                    <th className="px-4 py-3 sm:px-5">DOI</th>
                    <th className="px-4 py-3 text-right sm:px-5">Amount</th>
                    <th className="px-4 py-3 text-center sm:px-5">Invoice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {pagedReview.items.map((bill) => {
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
                            aria-label={`Select ${bill.incidentNo}`}
                            className="h-4 w-4 cursor-pointer accent-primary"
                          />
                        </td>
                        <td className="px-4 py-3.5 font-semibold tabular-nums text-ink sm:px-5 sm:py-4">
                          {bill.incidentNo}
                        </td>
                        <td className="px-4 py-3.5 text-ink sm:px-5 sm:py-4">
                          {bill.incident}
                        </td>
                        <td className="px-4 py-3.5 text-ink sm:px-5 sm:py-4">
                          {bill.provider}
                        </td>
                        <td className="px-4 py-3.5 text-muted sm:px-5 sm:py-4">
                          {bill.insurance}
                        </td>
                        <td className="px-4 py-3.5 sm:px-5 sm:py-4">
                          <Badge className="bg-secondary-100 text-secondary-700">
                            {bill.visit}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 tabular-nums text-muted sm:px-5 sm:py-4">
                          {bill.doi}
                        </td>
                        <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-ink sm:px-5 sm:py-4">
                          {formatMoney(bill.amount)}
                        </td>
                        <td className="px-4 py-3.5 text-center sm:px-5 sm:py-4">
                          <button
                            type="button"
                            onClick={() => handleInvoice(bill)}
                            aria-label={`Open invoice for ${bill.incidentNo}`}
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

          {!reviewLoading && !reviewError && filteredReview.length > 0 ? (
            <Pagination
              page={pagedReview.currentPage}
              totalPages={pagedReview.totalPages}
              total={pagedReview.total}
              start={pagedReview.start}
              end={pagedReview.end}
              onChange={setReviewPage}
              alwaysShow
            />
          ) : null}

          <div className="flex flex-col gap-3 border-t border-border/70 bg-cream/40 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="inline-flex items-center gap-2 text-sm font-medium text-ink">
              <CheckSquare className="h-4 w-4 text-primary" />
              {selectedBills.length} selected
              <span className="font-semibold tabular-nums">
                {formatMoney(selectedTotal)}
              </span>
            </p>
            <Button
              onClick={handlePay}
              disabled={selectedBills.length === 0}
              className="inline-flex items-center gap-2"
            >
              <CreditCard className="h-4 w-4" />
              Pay {formatMoney(selectedTotal)}
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          {paidLoading ? (
            <TableSkeleton
              columns={6}
              rows={5}
              minWidthClass="min-w-[48rem]"
              headers={[
                "Invoice #",
                "Provider",
                "Incident",
                "Type",
                "DOI",
                "Amount",
              ]}
            />
          ) : paidError ? (
            <EmptyState
              title="Unable to load paid bills"
              description={paidError}
              className="min-h-64 rounded-none border-0"
            />
          ) : paidBills.length === 0 ? (
            <EmptyState
              title="No paid bills found"
              description={
                query.trim()
                  ? "Try another search, or switch back to Bill Review."
                  : "No Urgent Care or Personal Injury payments on file yet."
              }
              className="min-h-64 rounded-none border-0"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[48rem] w-full text-left text-sm">
                <thead className="border-y border-border/70 bg-cream/50 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                  <tr>
                    <th className="px-4 py-3 sm:px-5">Invoice #</th>
                    <th className="px-4 py-3 sm:px-5">Provider</th>
                    <th className="px-4 py-3 sm:px-5">Incident</th>
                    <th className="px-4 py-3 sm:px-5">Type</th>
                    <th className="px-4 py-3 sm:px-5">DOI</th>
                    <th className="px-4 py-3 text-right sm:px-5">Amount</th>
                    <th className="px-4 py-3 text-center sm:px-5">Invoice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {paidBills.map((bill) => (
                    <tr
                      key={bill.id}
                      className="bg-white transition hover:bg-cream/40"
                    >
                      <td className="px-4 py-3.5 font-semibold tabular-nums text-ink sm:px-5 sm:py-4">
                        {bill.invoiceNo}
                      </td>
                      <td className="px-4 py-3.5 text-ink sm:px-5 sm:py-4">
                        {bill.provider}
                      </td>
                      <td className="px-4 py-3.5 text-ink sm:px-5 sm:py-4">
                        {bill.incident}
                      </td>
                      <td className="px-4 py-3.5 sm:px-5 sm:py-4">
                        <Badge className="bg-secondary-100 text-secondary-700">
                          {bill.type}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 tabular-nums text-muted sm:px-5 sm:py-4">
                        {bill.doi}
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-ink sm:px-5 sm:py-4">
                        {formatMoney(bill.amount)}
                      </td>
                      <td className="px-4 py-3.5 text-center sm:px-5 sm:py-4">
                        <button
                          type="button"
                          onClick={() => handleInvoice(bill, { download: true })}
                          aria-label={`Open invoice ${bill.invoiceNo}`}
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
