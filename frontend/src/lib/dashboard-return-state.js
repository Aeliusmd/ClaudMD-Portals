/**
 * Preserve dashboard filter/tab/search state across detail → Back navigation
 * via URL query params (no sessionStorage).
 */

export function buildDashboardStateParams({
  tab,
  filter,
  search,
  fromDate,
  toDate,
  page,
} = {}) {
  const params = new URLSearchParams();
  if (tab) params.set("tab", String(tab));
  if (filter) params.set("filter", String(filter));
  if (search && String(search).trim()) {
    params.set("search", String(search).trim());
  }
  if (fromDate) params.set("fromDate", String(fromDate));
  if (toDate) params.set("toDate", String(toDate));
  if (page && Number(page) > 1) params.set("page", String(page));
  return params;
}

export function parseDashboardStateParams(searchParams) {
  if (!searchParams) {
    return {
      tab: null,
      filter: null,
      search: "",
      fromDate: null,
      toDate: null,
      page: 1,
    };
  }
  const pageRaw = searchParams.get("page");
  const page = pageRaw && /^\d+$/.test(pageRaw) ? Math.max(1, Number(pageRaw)) : 1;
  return {
    tab: searchParams.get("tab") || null,
    filter: searchParams.get("filter") || null,
    search: (searchParams.get("search") || "").trim(),
    fromDate: searchParams.get("fromDate") || null,
    toDate: searchParams.get("toDate") || null,
    page,
  };
}

/** Attach current dashboard query as `return` for detail Back navigation. */
export function withReturnParams(targetParams, dashboardParams) {
  const qs = dashboardParams?.toString?.() || "";
  if (qs) targetParams.set("return", qs);
  return targetParams;
}

/** Resolve Back href to dashboard, restoring filters from `return` if present. */
export function dashboardHrefFromReturn(dashboardPath, searchParams) {
  const raw = searchParams?.get?.("return");
  if (!raw) return dashboardPath;
  // Only allow query-string style payloads (no protocol / absolute paths).
  if (/^[a-z]+:\/\//i.test(raw) || raw.includes("/")) {
    return dashboardPath;
  }
  return `${dashboardPath}?${raw}`;
}

export function hrefWithParams(path, params) {
  const qs = params?.toString?.() || "";
  return qs ? `${path}?${qs}` : path;
}
