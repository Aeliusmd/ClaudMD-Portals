/**
 * Shared email / phone rules for portal Profile Info forms.
 * Keep in sync with backend/app/validation/contact.py.
 */

export const EMAIL_MAX = 100;
export const PHONE_MAX = 20;
export const PHONE_DIGITS_MIN = 10;
export const PHONE_DIGITS_MAX = 15;

const EMAIL_PATTERN =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

const PHONE_ALLOWED_PATTERN = /^[\d\s+().-]*$/;

/** Strip anything that is not a digit or phone punctuation. */
export function sanitizePhoneInput(value) {
  return String(value ?? "")
    .replace(/[^\d\s+().-]/g, "")
    .slice(0, PHONE_MAX);
}

export function emailError(email, { required = true } = {}) {
  const value = String(email ?? "").trim();
  if (!value) {
    return required ? "Email is required." : null;
  }
  if (value.length > EMAIL_MAX) {
    return `Email must be at most ${EMAIL_MAX} characters.`;
  }
  if (
    value.includes("..") ||
    value.startsWith(".") ||
    value.endsWith(".") ||
    value.split("@").length !== 2
  ) {
    return "Enter a valid email address.";
  }
  const [local, domain] = value.split("@");
  if (
    !local ||
    !domain ||
    domain.startsWith(".") ||
    domain.endsWith(".") ||
    !EMAIL_PATTERN.test(value)
  ) {
    return "Enter a valid email address.";
  }
  return null;
}

export function phoneError(phone, { required = false } = {}) {
  const value = String(phone ?? "").trim();
  if (!value) {
    return required ? "Phone is required." : null;
  }
  if (value.length > PHONE_MAX) {
    return `Phone must be at most ${PHONE_MAX} characters.`;
  }
  if (!PHONE_ALLOWED_PATTERN.test(value)) {
    return "Phone may only include numbers and + - ( ) . or spaces.";
  }
  if (value.includes("+") && (!value.startsWith("+") || value.indexOf("+", 1) !== -1)) {
    return "Phone may only include numbers and + - ( ) . or spaces.";
  }
  const digits = value.replace(/\D/g, "");
  if (digits.length < PHONE_DIGITS_MIN) {
    return `Enter a valid phone number (at least ${PHONE_DIGITS_MIN} digits).`;
  }
  if (digits.length > PHONE_DIGITS_MAX) {
    return `Enter a valid phone number (at most ${PHONE_DIGITS_MAX} digits).`;
  }
  return null;
}
