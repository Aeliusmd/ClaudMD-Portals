"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  LifeBuoy,
  Mail,
  Paperclip,
  Plus,
  Search,
  Send,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { SkeletonBlock } from "@/components/ui/skeleton";
import { getAccessToken } from "@/lib/auth-session";
import { LOGIN_PATH } from "@/lib/auth-routes";
import { cn } from "@/lib/utils";

/** Support inbox page size for all portals (employer / insurance / patient). */
const SUPPORT_INBOX_PAGE_SIZE = 10;

function formatWhen(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusTone(status) {
  if (status === "sent") return "bg-emerald-50 text-emerald-700";
  if (status === "received") return "bg-sky-50 text-sky-800";
  if (status === "failed") return "bg-rose-50 text-rose-700";
  return "bg-amber-50 text-amber-800";
}

function recipientChipLabel(user) {
  return user?.displayLabel || user?.email || user?.fullName || "User";
}

function SuccessToast({ message, title, onDismiss }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => {
      onDismiss?.();
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-20 right-4 z-[60] w-[min(22rem,calc(100vw-2rem))] sm:right-6"
    >
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3.5 shadow-[0_12px_32px_rgba(28,36,48,0.14)]">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          <Check className="h-4 w-4" strokeWidth={2.5} />
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="font-sans text-sm font-semibold text-emerald-900">
            {title || "Success"}
          </p>
          <p className="mt-0.5 font-sans text-[0.8rem] leading-snug text-emerald-800/80">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}

function MessageDetailModal({ open, loading, message, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Message details"
        className="flex max-h-[min(36rem,90vh)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border/80 bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Message details</p>
            <p className="mt-0.5 text-xs text-muted">
              Internal clinic inbox message
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-cream hover:text-ink"
            aria-label="Close message details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="space-y-2" aria-busy="true">
              <SkeletonBlock className="h-4 w-1/2" />
              <SkeletonBlock className="h-3 w-full" />
              <SkeletonBlock className="h-3 w-5/6" />
              <SkeletonBlock className="h-24 w-full" />
            </div>
          ) : message ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  className={statusTone(message.direction || message.status)}
                >
                  {message.direction || message.status}
                </Badge>
                <span className="text-xs text-muted">
                  {formatWhen(message.createdAt)}
                </span>
              </div>
              <p className="text-base font-semibold text-ink">
                {message.subject}
              </p>
              <div className="space-y-1 rounded-xl bg-cream/70 px-3.5 py-3 text-xs text-muted">
                <p>
                  <span className="font-semibold text-ink">From:</span>{" "}
                  {message.fromUser?.displayLabel ||
                    message.fromName ||
                    "—"}
                </p>
                <p>
                  <span className="font-semibold text-ink">To:</span>{" "}
                  {message.toUser?.displayLabel || message.toEmail || "—"}
                </p>
                {message.ccUsers?.length ? (
                  <p>
                    <span className="font-semibold text-ink">CC:</span>{" "}
                    {message.ccUsers
                      .map((user) => user.displayLabel)
                      .join(", ")}
                  </p>
                ) : null}
              </div>
              <p className="whitespace-pre-wrap leading-relaxed text-ink">
                {message.body}
              </p>
              {message.attachments?.length ? (
                <div className="rounded-xl border border-border/70 bg-white px-3.5 py-3 text-xs text-ink">
                  <p className="font-semibold">Attachments</p>
                  <ul className="mt-1.5 space-y-1">
                    {message.attachments.map((file) => (
                      <li key={file.id} className="flex items-center gap-1.5">
                        <Paperclip className="h-3.5 w-3.5 text-muted" />
                        <span className="truncate">{file.fileName}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted">
              Unable to load this message.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function RecipientPicker({
  open,
  onClose,
  onSelect,
  excludeIds,
  anchorLabel,
  fetchRecipients,
  loginPath = LOGIN_PATH,
}) {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const router = useRouter();
  const searchRef = useRef(null);
  const excluded = useMemo(
    () => new Set((excludeIds || []).map((id) => Number(id))),
    [excludeIds]
  );

  useEffect(() => {
    if (!open) {
      setSearch("");
      return undefined;
    }
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const token = getAccessToken();
      if (!token) {
        router.replace(loginPath);
        return;
      }
      setLoading(true);
      try {
        const data = await fetchRecipients(token, {
          search: search.trim(),
        });
        if (!cancelled) {
          setItems(
            data.items.filter((item) => !excluded.has(Number(item.userId)))
          );
          setError(null);
        }
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 401) {
          router.replace(loginPath);
          return;
        }
        setError(err?.message || "Unable to load clinic users.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [excluded, fetchRecipients, loginPath, open, router, search]);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={anchorLabel}
        className="flex max-h-[min(32rem,85vh)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border/80 bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border/60 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">{anchorLabel}</p>
              <p className="mt-0.5 text-xs text-muted">
                Search clinic staff by name, occupation, or email.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-muted hover:bg-cream hover:text-ink"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <label className="relative mt-3 block">
            <span className="sr-only">Search clinic staff</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              ref={searchRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, occupation, or email…"
              className="w-full rounded-xl border border-border/80 bg-white py-2.5 pr-3 pl-9 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <p className="px-4 py-4 text-sm text-muted">Loading…</p>
          ) : error ? (
            <p className="px-4 py-4 text-sm text-rose-700">{error}</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted">
              {search.trim()
                ? "No clinic staff match your search."
                : "No clinic users found."}
            </p>
          ) : (
            items.map((user) => (
              <button
                key={user.userId}
                type="button"
                onClick={() => {
                  onSelect(user);
                  onClose();
                  setSearch("");
                }}
                className="flex w-full cursor-pointer flex-col gap-0.5 border-b border-border/40 px-4 py-3 text-left last:border-b-0 hover:bg-cream/60"
              >
                <span className="text-sm font-semibold text-ink">
                  {user.fullName}
                  {user.occupation ? (
                    <span className="font-normal text-muted">
                      {" "}
                      · {user.occupation}
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-muted">
                  {user.email || user.loginId || "No email"}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function PortalSupportView({
  api,
  loginPath = LOGIN_PATH,
}) {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const [clinic, setClinic] = useState(null);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [toUser, setToUser] = useState(null);
  const [ccUsers, setCcUsers] = useState([]);
  const [toPickerOpen, setToPickerOpen] = useState(false);
  const [ccPickerOpen, setCcPickerOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState([]);
  const [formError, setFormError] = useState(null);
  const [successToast, setSuccessToast] = useState(null);
  const [sending, setSending] = useState(false);

  const excludeIds = useMemo(() => {
    const ids = [];
    if (clinic?.fromUserId) ids.push(clinic.fromUserId);
    if (toUser?.userId) ids.push(toUser.userId);
    for (const user of ccUsers) ids.push(user.userId);
    return ids;
  }, [ccUsers, clinic?.fromUserId, toUser?.userId]);

  const loadInbox = useCallback(
    async (nextPage = page) => {
      const token = getAccessToken();
      if (!token) {
        router.replace(loginPath);
        return;
      }
      setLoading(true);
      try {
        const [clinicInfo, messages] = await Promise.all([
          api.fetchClinic(token),
          api.fetchMessages(token, {
            page: nextPage,
            pageSize: SUPPORT_INBOX_PAGE_SIZE,
          }),
        ]);
        setClinic(clinicInfo);
        setItems(messages.items);
        setTotal(messages.total);
        setTotalPages(messages.totalPages);
        setPage(messages.page);
        setError(null);
      } catch (err) {
        if (err?.status === 401) {
          router.replace(loginPath);
          return;
        }
        setError(err?.message || "Unable to load support inbox.");
      } finally {
        setLoading(false);
      }
    },
    [api, loginPath, page, router]
  );

  useEffect(() => {
    loadInbox(page);
  }, [loadInbox, page]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    let cancelled = false;
    async function loadDetail() {
      const token = getAccessToken();
      if (!token) return;
      setLoadingDetail(true);
      try {
        const detail = await api.fetchMessage(token, selectedId);
        if (!cancelled) {
          setSelected(detail);
          // Opening detail marks IsSeen on the server for received mail.
          if (detail?.isSeen) {
            setItems((prev) =>
              prev.map((item) =>
                String(item.id) === String(selectedId)
                  ? { ...item, isSeen: true }
                  : item
              )
            );
          }
        }
      } catch (err) {
        if (cancelled) return;
        if (err?.status === 401) {
          router.replace(loginPath);
          return;
        }
        setSelected(null);
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    }
    loadDetail();
    return () => {
      cancelled = true;
    };
  }, [api, loginPath, router, selectedId]);

  function addCcUser(user) {
    setCcUsers((prev) => {
      if (prev.some((item) => Number(item.userId) === Number(user.userId))) {
        return prev;
      }
      return [...prev, user];
    });
  }

  function removeCcUser(userId) {
    setCcUsers((prev) =>
      prev.filter((item) => Number(item.userId) !== Number(userId))
    );
  }

  function onFilesChosen(event) {
    const next = Array.from(event.target.files || []);
    setFiles((prev) => [...prev, ...next].slice(0, 5));
    event.target.value = "";
  }

  async function handleSend(event) {
    event.preventDefault();
    setFormError(null);
    setSuccessToast(null);

    if (!toUser?.userId) {
      setFormError("Select a To recipient.");
      return;
    }
    if (!subject.trim()) {
      setFormError("Subject is required.");
      return;
    }
    if (!body.trim()) {
      setFormError("Message is required.");
      return;
    }

    const token = getAccessToken();
    if (!token) {
      router.replace(loginPath);
      return;
    }

    setSending(true);
    try {
      await api.sendMessage(token, {
        toUserId: toUser.userId,
        ccUserIds: ccUsers.map((user) => user.userId),
        subject: subject.trim(),
        body: body.trim(),
        files,
      });
      setToUser(null);
      setCcUsers([]);
      setSubject("");
      setBody("");
      setFiles([]);
      setToPickerOpen(false);
      setCcPickerOpen(false);
      setSelectedId(null);
      setSuccessToast({
        title: "Message sent",
        message: "Your message was sent successfully.",
      });
      await loadInbox(1);
      setPage(1);
    } catch (err) {
      if (err?.status === 401) {
        router.replace(loginPath);
        return;
      }
      setFormError(err?.message || "Unable to send support message.");
    } finally {
      setSending(false);
    }
  }

  function closeMessageDetail() {
    setSelectedId(null);
    setSelected(null);
  }

  return (
    <div className="space-y-6">
      <SuccessToast
        title={successToast?.title}
        message={successToast?.message}
        onDismiss={() => setSuccessToast(null)}
      />
      <MessageDetailModal
        open={Boolean(selectedId)}
        loading={loadingDetail}
        message={selected}
        onClose={closeMessageDetail}
      />

      <PageHeader
        title="Support"
        description="Send an internal message to clinic staff. Messages are stored in the clinic inbox."
      />

      <Card className="border-border/70 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary">
            <LifeBuoy className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">
              {clinic?.clinicName || "Your clinic"}
            </p>
            <p className="mt-1 text-sm text-muted">
              From:{" "}
              <span className="font-medium text-ink">
                {clinic?.fromName || "You"}
                {clinic?.fromEmail ? ` · ${clinic.fromEmail}` : ""}
              </span>
            </p>
            {!clinic?.canSend ? (
              <p className="mt-2 text-xs font-medium text-amber-800">
                Your user profile could not be resolved for messaging.
              </p>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <Card className="overflow-hidden p-0 shadow-[0_8px_30px_rgba(28,36,48,0.06)]">
          <div className="border-b border-[#f0ebe3] bg-[#faf8f5] px-5 py-4">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-ink">Inbox</h2>
            </div>
            <p className="mt-1 text-xs text-muted">
              {total} message{total === 1 ? "" : "s"} for your account
            </p>
          </div>

          {loading ? (
            <div className="space-y-3 p-5" aria-busy="true">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="space-y-2">
                  <SkeletonBlock className="h-4 w-2/3" />
                  <SkeletonBlock className="h-3 w-full" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="p-5 text-sm text-rose-700">{error}</div>
          ) : items.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No messages yet"
                description="Compose an internal message to clinic staff to get started."
              />
            </div>
          ) : (
            <div className="divide-y divide-[#f0ebe3]">
              {items.map((item) => {
                const active = item.id === selectedId;
                const unread =
                  item.direction === "received" && item.isSeen === false;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={cn(
                      "flex w-full cursor-pointer items-start gap-3 px-5 py-3.5 text-left transition hover:bg-cream/50",
                      active && "bg-sky-50/70",
                      unread && !active && "bg-[#fff7f7]"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        unread ? "bg-[#e11d48]" : "bg-[#d1d5db]"
                      )}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <p
                          className={cn(
                            "truncate text-sm text-ink",
                            unread ? "font-bold" : "font-semibold"
                          )}
                        >
                          {item.subject}
                        </p>
                        <Badge
                          className={statusTone(item.direction || item.status)}
                        >
                          {item.direction || item.status}
                        </Badge>
                      </div>
                      <p className="line-clamp-2 text-xs text-muted">
                        {item.preview || "—"}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                        <span>
                          {item.direction === "received" ? "From " : "To "}
                          {item.direction === "received"
                            ? item.fromUser?.displayLabel ||
                              item.fromEmail ||
                              "—"
                            : item.toUser?.displayLabel ||
                              item.toEmail ||
                              "—"}
                        </span>
                        {item.ccLabels?.length ? (
                          <>
                            <span>·</span>
                            <span>CC {item.ccLabels.join(", ")}</span>
                          </>
                        ) : null}
                        <span>·</span>
                        <span>{formatWhen(item.createdAt)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {totalPages > 1 ? (
            <div className="border-t border-[#f0ebe3] px-4 py-3">
              <Pagination
                page={page}
                totalPages={totalPages}
                onChange={setPage}
                start={total === 0 ? 0 : (page - 1) * SUPPORT_INBOX_PAGE_SIZE + 1}
                end={Math.min(page * SUPPORT_INBOX_PAGE_SIZE, total)}
                total={total}
                alwaysShow
              />
            </div>
          ) : null}
        </Card>

        <div className="space-y-6">
          <Card className="p-5 shadow-[0_8px_30px_rgba(28,36,48,0.06)]">
            <h2 className="text-sm font-semibold text-ink">New message</h2>

            <form className="mt-4 space-y-4" onSubmit={handleSend}>
              <div className="relative">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold tracking-[0.08em] text-[#8B6D4F] uppercase">
                    To
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setToPickerOpen((open) => !open);
                      setCcPickerOpen(false);
                    }}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/80 text-ink hover:bg-cream"
                    aria-label="Add To recipient"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="min-h-[42px] rounded-xl border border-border/80 bg-white px-3 py-2">
                  {toUser ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-cream px-2.5 py-1 text-xs font-medium text-ink">
                      {recipientChipLabel(toUser)}
                      <button
                        type="button"
                        onClick={() => setToUser(null)}
                        className="text-muted hover:text-ink"
                        aria-label="Remove To recipient"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ) : (
                    <span className="text-sm text-muted">
                      Add a clinic user…
                    </span>
                  )}
                </div>
                <RecipientPicker
                  open={toPickerOpen}
                  onClose={() => setToPickerOpen(false)}
                  onSelect={(user) => {
                    setToUser(user);
                    setCcUsers((prev) =>
                      prev.filter(
                        (item) => Number(item.userId) !== Number(user.userId)
                      )
                    );
                  }}
                  excludeIds={excludeIds.filter(
                    (id) => Number(id) !== Number(toUser?.userId)
                  )}
                  anchorLabel="Select To"
                  fetchRecipients={api.fetchRecipients}
                  loginPath={loginPath}
                />
              </div>

              <div className="relative">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold tracking-[0.08em] text-[#8B6D4F] uppercase">
                    CC
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCcPickerOpen((open) => !open);
                      setToPickerOpen(false);
                    }}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/80 text-ink hover:bg-cream"
                    aria-label="Add CC recipient"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="min-h-[42px] rounded-xl border border-border/80 bg-white px-3 py-2">
                  {ccUsers.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {ccUsers.map((user) => (
                        <span
                          key={user.userId}
                          className="inline-flex items-center gap-1.5 rounded-full bg-cream px-2.5 py-1 text-xs font-medium text-ink"
                        >
                          {recipientChipLabel(user)}
                          <button
                            type="button"
                            onClick={() => removeCcUser(user.userId)}
                            className="text-muted hover:text-ink"
                            aria-label={`Remove ${recipientChipLabel(user)}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-muted">
                      Optional — add CC users…
                    </span>
                  )}
                </div>
                <RecipientPicker
                  open={ccPickerOpen}
                  onClose={() => setCcPickerOpen(false)}
                  onSelect={addCcUser}
                  excludeIds={excludeIds}
                  anchorLabel="Select CC"
                  fetchRecipients={api.fetchRecipients}
                  loginPath={loginPath}
                />
              </div>

              <label className="block space-y-1.5" htmlFor="support-subject">
                <span className="text-[11px] font-semibold tracking-[0.08em] text-[#8B6D4F] uppercase">
                  Subject
                </span>
                <input
                  id="support-subject"
                  value={subject}
                  maxLength={200}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="Short summary"
                  className="w-full rounded-xl border border-border/80 bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </label>

              <label className="block space-y-1.5" htmlFor="support-body">
                <span className="text-[11px] font-semibold tracking-[0.08em] text-[#8B6D4F] uppercase">
                  Message
                </span>
                <textarea
                  id="support-body"
                  value={body}
                  maxLength={5000}
                  rows={7}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Write your message to clinic staff…"
                  className="w-full resize-y rounded-xl border border-border/80 bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </label>

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold tracking-[0.08em] text-[#8B6D4F] uppercase">
                    Attachments
                  </span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    Add files
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={onFilesChosen}
                />
                {files.length ? (
                  <ul className="space-y-1.5">
                    {files.map((file, index) => (
                      <li
                        key={`${file.name}-${index}`}
                        className="flex items-center justify-between gap-2 rounded-lg bg-cream/70 px-3 py-2 text-xs text-ink"
                      >
                        <span className="truncate">{file.name}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setFiles((prev) =>
                              prev.filter((_, i) => i !== index)
                            )
                          }
                          className="text-muted hover:text-ink"
                          aria-label={`Remove ${file.name}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted">
                    Optional — up to 5 files, 5 MB each.
                  </p>
                )}
              </div>

              {formError ? (
                <p className="text-sm font-medium text-rose-700">{formError}</p>
              ) : null}

              <Button
                type="submit"
                disabled={sending || clinic?.canSend === false}
                className="inline-flex items-center gap-2"
              >
                <Send className="h-4 w-4" />
                {sending ? "Sending..." : "Send message"}
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
