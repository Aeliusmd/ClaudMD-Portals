/**
 * Reject HTML / script markers in free-text profile / search fields.
 * Keep in sync with backend/app/validation/text.py.
 */

const HTML_MARKERS =
  /<|>|javascript\s*:|vbscript\s*:|data\s*:\s*text\s*\/\s*html|on[a-z]+\s*=|<\s*\/?\s*script|<\s*\/?\s*iframe|<\s*\/?\s*object|<\s*\/?\s*embed|<\s*\/?\s*svg|<\s*\/?\s*img|<\s*\/?\s*link|<\s*\/?\s*meta|<\s*\/?\s*style/i;

export const SAFE_TEXT_ERROR =
  "HTML, scripts, or unsafe markup are not allowed.";

export const SEARCH_MAX = 100;

export function unsafeMarkupError(value) {
  const text = String(value ?? "");
  if (!text) return null;
  if (HTML_MARKERS.test(text)) return SAFE_TEXT_ERROR;
  return null;
}

/** Validate dashboard / list search text before apply or API call. */
export function searchQueryError(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (text.length > SEARCH_MAX) {
    return `Search must be at most ${SEARCH_MAX} characters.`;
  }
  return unsafeMarkupError(text);
}
