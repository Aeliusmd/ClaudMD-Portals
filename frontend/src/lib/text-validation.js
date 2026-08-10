/**
 * Reject HTML / script markers in free-text profile fields.
 * Keep in sync with backend/app/validation/text.py.
 */

const HTML_MARKERS =
  /<|>|javascript\s*:|vbscript\s*:|data\s*:\s*text\s*\/\s*html|on[a-z]+\s*=|<\s*\/?\s*script|<\s*\/?\s*iframe|<\s*\/?\s*object|<\s*\/?\s*embed|<\s*\/?\s*svg|<\s*\/?\s*img|<\s*\/?\s*link|<\s*\/?\s*meta|<\s*\/?\s*style/i;

export const SAFE_TEXT_ERROR =
  "HTML, scripts, or unsafe markup are not allowed.";

export function unsafeMarkupError(value) {
  const text = String(value ?? "");
  if (!text) return null;
  if (HTML_MARKERS.test(text)) return SAFE_TEXT_ERROR;
  return null;
}
