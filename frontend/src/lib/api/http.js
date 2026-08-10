/**
 * Shared fetch helpers so network / server-down failures show a clear message
 * instead of the browser's raw "Failed to fetch".
 */

export function isNetworkFetchError(err) {
  if (!err) return false;
  if (err.name === "TypeError") return true;
  const message = String(err.message || "").toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("load failed") ||
    message.includes("fetch failed")
  );
}

export function networkUnavailableError(fallbackMessage, cause) {
  const base =
    (fallbackMessage && String(fallbackMessage).trim()) ||
    "Unable to complete this request.";
  const error = new Error(
    `${base} The server appears to be unavailable. Please try again.`
  );
  error.status = 0;
  error.isNetworkError = true;
  error.detail = error.message;
  if (cause) error.cause = cause;
  return error;
}

export async function fetchJson(url, options, fallbackMessage) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (err) {
    throw networkUnavailableError(fallbackMessage, err);
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const detail =
      (data && (data.detail || data.message)) || fallbackMessage;
    const error = new Error(
      typeof detail === "string"
        ? detail
        : detail?.message || fallbackMessage
    );
    error.status = response.status;
    error.detail = detail;
    throw error;
  }

  return data;
}
