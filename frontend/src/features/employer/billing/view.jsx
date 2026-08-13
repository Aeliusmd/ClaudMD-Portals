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
import { TableSkeleton } from "@/components/ui/skeleton";
import { employerBillingBills } from "@/data/employer-billing";
import { fetchEmployerPaidBills } from "@/lib/api/employer";
import { LOGIN_PATH } from "@/lib/auth-routes";
import { getAccessToken } from "@/lib/auth-session";
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
  const [selectedIds, setSelectedIds] = useState(() => new Set(["bill-001"]));
  const [message, setMessage] = useState("");
  const [paidBills, setPaidBills] = useState([]);
  const [paidTotal, setPaidTotal] = useState(0);
  const [paidLoading, setPaidLoading] = useState(true);
  const [paidError, setPaidError] = useState(null);

  const reviewBills = useMemo(
    () => employerBillingBills.filter((bill) => bill.status === "review"),
    []
  );

  const payableBills = useMemo(
    () => reviewBills.filter((bill) => bill.amount > 0),
    [reviewBills]
  );
  const outstandingTotal = useMemo(
    () => payableBills.reduce((sum, bill) => sum + bill.amount, 0),
    [payableBills]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadPaidBills() {
      const token = getAccessToken();
      if (!token) {
        router.replace(LOGIN_PATH);
        return;
      }

      setPaidLoading(true);
      try {
        const data = await fetchEmployerPaidBills(token);
        if (cancelled) return;
        setPaidBills(data.items);
        setPaidTotal(data.totalPaid);
        setPaidError(null);
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 401) {
          router.replace(LOGIN_PATH);
          return;
        }
        setPaidBills([]);
        setPaidTotal(0);
        setPaidError(err?.message || "Unable to load paid bills.");
      } finally {
        if (!cancelled) setPaidLoading(false);
      }
    }

    loadPaidBills();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const filteredReview = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return reviewBills;
    return reviewBills.filter((bill) => matchesReviewQuery(bill, normalized));
  }, [reviewBills, query]);

  const filteredPaid = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return paidBills;
    return paidBills.filter((bill) => matchesPaidQuery(bill, normalized));
  }, [paidBills, query]);

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
  }

  function handlePay() {
    if (!selectedBills.length) return;
    setMessage(
      `Demo only — ${selectedBills.length} bill${
        selectedBills.length === 1 ? "" : "s"
      } totaling ${formatMoney(selectedTotal)} would be submitted for payment.`
    );
  }

  function handleInvoice(bill) {
    setMessage(
      `Demo invoice for ${bill.patientName} · Acct ${bill.accountNo} · ${formatMoney(bill.amount)}.`
    );
  }

  function handleDownload(bill) {
    setMessage(`Demo download — ${bill.invoiceNo}.`);
  }

  return (
    <div className="space-y-5">
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
              A quick summary of your current bill review queue.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <OverviewCard
              featured
              label="Total Outstanding"
              value={formatMoney(outstandingTotal)}
              detail={`${payableBills.length} bills with a balance`}
              iconWrap="bg-white/15 text-white"
              icon={<Receipt className="h-5 w-5" />}
            />
            <OverviewCard
              label="Payable bills"
              value={payableBills.length}
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
          {filteredReview.length === 0 ? (
            <EmptyState
              title="No bills found"
              description="Try another search or switch between Bill Review and Paid Bills."
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
          {paidLoading ? (
            <TableSkeleton
              columns={7}
              rows={5}
              minWidthClass="min-w-[56rem]"
              headers={[
                "Invoice #",
                "Patient",
                "Description",
                "Paid On",
                "Amount",
                "Status",
                "Invoice",
              ]}
            />
          ) : paidError ? (
            <EmptyState
              title="Unable to load paid bills"
              description={paidError}
              className="min-h-64 rounded-none border-0"
            />
          ) : filteredPaid.length === 0 ? (
            <EmptyState
              title="No paid bills found"
              description={
                query.trim()
                  ? "Try another search, or switch back to Bill Review."
                  : "No payments are on file for your organization yet."
              }
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
