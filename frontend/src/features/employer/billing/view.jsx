"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  Receipt,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SearchInput } from "@/components/ui/search-input";
import { SkeletonBlock, TableSkeleton } from "@/components/ui/skeleton";
import { ClientServicesInvoiceModal } from "@/features/employer/billing/client-services-invoice-modal";
import { MakePaymentModal } from "@/features/employer/billing/make-payment-modal";
import {
  fetchEmployerBillInvoice,
  fetchEmployerBillReview,
  fetchEmployerPaidBills,
} from "@/lib/api/employer";
import { getAccessToken } from "@/lib/auth-session";
import { EMPLOYER_LOGIN_PATH } from "@/lib/portal-paths";
import { searchQueryError } from "@/lib/text-validation";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 10;

function formatMoney(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function PaginationFooter({
  page,
  totalPages,
  totalCount,
  label,
  onPrevious,
  onNext,
}) {
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, totalCount);

  return (
    <div className="flex flex-col gap-3 border-t border-border/70 bg-cream/40 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <p className="text-sm text-muted">
        Showing {start}–{end} of {totalCount} {label}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={page <= 1}
          onClick={onPrevious}
          className="gap-1.5 px-3.5 py-2"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <span className="min-w-20 text-center text-sm font-medium text-ink">
          Page {page} of {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={page >= totalPages}
          onClick={onNext}
          className="gap-1.5 px-3.5 py-2"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
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
  const [appliedQuery, setAppliedQuery] = useState("");
  const [searchError, setSearchError] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [message, setMessage] = useState("");
  const [transientMessageId, setTransientMessageId] = useState(0);
  const [paidBills, setPaidBills] = useState([]);
  const [paidTotal, setPaidTotal] = useState(0);
  const [paidCount, setPaidCount] = useState(0);
  const [paidPage, setPaidPage] = useState(1);
  const [paidTotalPages, setPaidTotalPages] = useState(1);
  const [paidLoading, setPaidLoading] = useState(false);
  const [paidError, setPaidError] = useState(null);
  const [paidPhysicalOnly, setPaidPhysicalOnly] = useState(true);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState(null);
  const [invoice, setInvoice] = useState(null);
  const [invoiceDownloadRequested, setInvoiceDownloadRequested] = useState(false);

  const [reviewBills, setReviewBills] = useState([]);
  const [payableCount, setPayableCount] = useState(0);
  const [outstandingTotal, setOutstandingTotal] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewTotalPages, setReviewTotalPages] = useState(1);
  const [reviewLoading, setReviewLoading] = useState(true);
  const [reviewError, setReviewError] = useState(null);

  useEffect(() => {
    if (!transientMessageId) return undefined;
    const timer = window.setTimeout(() => setMessage(""), 10000);
    return () => window.clearTimeout(timer);
  }, [transientMessageId]);

  useEffect(() => {
    if (tab !== "paid") return undefined;

    let cancelled = false;

    async function loadPaid() {
      const token = getAccessToken();
      if (!token) {
        router.replace(EMPLOYER_LOGIN_PATH);
        return;
      }

      setPaidLoading(true);
      try {
        const data = await fetchEmployerPaidBills(token, {
          page: paidPage,
          pageSize: PAGE_SIZE,
          search: appliedQuery,
        });
        if (cancelled) return;
        setPaidBills(data.items);
        setPaidTotal(data.totalPaid);
        setPaidCount(data.total);
        setPaidTotalPages(data.totalPages);
        setPaidPage(data.page);
        setPaidPhysicalOnly(data.physicalOnly);
        setPaidError(null);
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 401) {
          router.replace(EMPLOYER_LOGIN_PATH);
          return;
        }
        setPaidBills([]);
        setPaidTotal(0);
        setPaidCount(0);
        setPaidTotalPages(1);
        setPaidPhysicalOnly(true);
        setPaidError(err?.message || "Unable to load paid bills.");
      } finally {
        if (!cancelled) setPaidLoading(false);
      }
    }

    loadPaid();
    return () => {
      cancelled = true;
    };
  }, [appliedQuery, paidPage, router, tab]);

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
        const data = await fetchEmployerBillReview(token, {
          page: reviewPage,
          pageSize: PAGE_SIZE,
          search: appliedQuery,
        });
        if (cancelled) return;
        setReviewBills(data.items);
        setPayableCount(data.payableCount);
        setOutstandingTotal(data.outstandingTotal);
        setReviewCount(data.total);
        setReviewTotalPages(data.totalPages);
        setReviewPage(data.page);
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
        setReviewCount(0);
        setReviewTotalPages(1);
      } finally {
        if (!cancelled) setReviewLoading(false);
      }
    }

    loadReview();
    return () => {
      cancelled = true;
    };
  }, [appliedQuery, reviewPage, router, tab]);

  const selectedBills = useMemo(
    () => reviewBills.filter((bill) => selectedIds.has(bill.id)),
    [reviewBills, selectedIds]
  );
  const selectedTotal = selectedBills.reduce((sum, bill) => sum + bill.amount, 0);
  const allVisibleSelected =
    reviewBills.length > 0 &&
    reviewBills.every((bill) => selectedIds.has(bill.id));

  function toggleAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        reviewBills.forEach((bill) => next.delete(bill.id));
      } else {
        reviewBills.forEach((bill) => next.add(bill.id));
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

  function resetPaging() {
    setPaidPage(1);
    setReviewPage(1);
  }

  function applySearch() {
    const next = query.trim();
    if (!next) return;
    const invalid = searchQueryError(next);
    if (invalid) {
      setSearchError(invalid);
      return;
    }
    setSearchError(null);
    resetPaging();
    setAppliedQuery(next);
  }

  function clearSearch() {
    setQuery("");
    setSearchError(null);
    resetPaging();
    setAppliedQuery("");
  }

  function handleQueryChange(event) {
    const next = event.target.value;
    setQuery(next);
    setSearchError(searchQueryError(next));
    // Emptying the box drops the applied filter so results never look stale.
    if (!next.trim() && appliedQuery) {
      resetPaging();
      setAppliedQuery("");
    }
  }

  function switchTab(nextTab) {
    setTab(nextTab);
    setQuery("");
    setAppliedQuery("");
    setSearchError(null);
    setSelectedIds(new Set());
    setPaidPage(1);
    setReviewPage(1);
    setMessage("");
    setPaymentOpen(false);
    setInvoiceOpen(false);
    setInvoice(null);
    setInvoiceError(null);
    setInvoiceDownloadRequested(false);
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
      router.replace(EMPLOYER_LOGIN_PATH);
      return;
    }

    setMessage("");
    setInvoiceOpen(!download);
    setInvoiceLoading(true);
    setInvoiceError(null);
    setInvoice(null);
    setInvoiceDownloadRequested(download);
    try {
      const detail = await fetchEmployerBillInvoice(
        token,
        bill.billingHeaderId,
        download ? bill.historyId : null
      );
      setInvoice(detail);
    } catch (err) {
      if (err?.status === 401) {
        router.replace(EMPLOYER_LOGIN_PATH);
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
    <div className="space-y-5">
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
                value={reviewCount}
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
            {paidPhysicalOnly
              ? "Physical-category payment history for your organization."
              : "No Physical payments on file yet — showing all visit types for now."}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <SearchInput
          className="flex-1"
          value={query}
          onChange={handleQueryChange}
          onClear={clearSearch}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              applySearch();
            }
          }}
          placeholder={
            tab === "paid"
              ? "Search by name, acct #, visit, or invoice..."
              : "Search by name, acct #, visit, or DOS..."
          }
          ariaLabel={tab === "paid" ? "Search paid bills" : "Search bills"}
        />
        <Button
          type="button"
          onClick={applySearch}
          disabled={!query.trim() || Boolean(searchError)}
          className="h-[3.15rem] shrink-0 rounded-2xl px-6 sm:w-auto"
        >
          <Search className="h-4 w-4" strokeWidth={2.25} />
          Search
        </Button>
      </div>

      {searchError ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {searchError}
        </p>
      ) : null}

      {appliedQuery && !searchError ? (
        <p className="text-sm text-muted">
          Showing results for{" "}
          <span className="font-semibold text-ink">“{appliedQuery}”</span>
        </p>
      ) : null}

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
          ) : reviewBills.length === 0 ? (
            <EmptyState
              title="No bills found"
              description={
                appliedQuery
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
                  {reviewBills.map((bill) => {
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

          {!reviewLoading && !reviewError && reviewCount > 0 ? (
            <PaginationFooter
              page={reviewPage}
              totalPages={reviewTotalPages}
              totalCount={reviewCount}
              label="bills"
              onPrevious={() => setReviewPage((page) => Math.max(1, page - 1))}
              onNext={() =>
                setReviewPage((page) => Math.min(reviewTotalPages, page + 1))
              }
            />
          ) : null}

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
          {paidLoading ? (
            <TableSkeleton
              columns={6}
              rows={5}
              minWidthClass="min-w-[48rem]"
              headers={[
                "DOS",
                "Acct. #",
                "Patient Name",
                "Visit",
                "Amount",
                "Invoice",
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
                appliedQuery
                  ? "Try another search, or switch back to Bill Review."
                  : "No payments are on file for your organization yet."
              }
              className="min-h-64 rounded-none border-0"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[48rem] w-full text-left text-sm">
                <thead className="border-y border-border/70 bg-cream/50 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">
                  <tr>
                    <th className="px-4 py-3 sm:px-5">DOS</th>
                    <th className="px-4 py-3 sm:px-5">Acct. #</th>
                    <th className="px-4 py-3 sm:px-5">Patient Name</th>
                    <th className="px-4 py-3 sm:px-5">Visit</th>
                    <th className="px-4 py-3 text-right sm:px-5">Amount</th>
                    <th className="px-4 py-3 text-center sm:px-5">Invoice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {paidBills.map((bill) => (
                    <tr key={bill.id} className="bg-white transition hover:bg-cream/40">
                      <td className="px-4 py-3.5 tabular-nums text-ink sm:px-5 sm:py-4">
                        {bill.dos}
                      </td>
                      <td className="px-4 py-3.5 tabular-nums text-muted sm:px-5 sm:py-4">
                        {bill.accountNo}
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-ink sm:px-5 sm:py-4">
                        {bill.patientName || "Patient"}
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
                          onClick={() => handleInvoice(bill, { download: true })}
                          aria-label={`Download invoice for ${
                            bill.patientName || "patient"
                          }`}
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
          {!paidLoading && !paidError && paidCount > 0 ? (
            <PaginationFooter
              page={paidPage}
              totalPages={paidTotalPages}
              totalCount={paidCount}
              label="payments"
              onPrevious={() => setPaidPage((page) => Math.max(1, page - 1))}
              onNext={() =>
                setPaidPage((page) => Math.min(paidTotalPages, page + 1))
              }
            />
          ) : null}
        </Card>
      )}
    </div>
  );
}
