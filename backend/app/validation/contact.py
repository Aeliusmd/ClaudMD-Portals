"""Shared email / phone validation for portal profile updates."""

from __future__ import annotations

import re

EMAIL_MAX = 100
PHONE_MAX = 20
PHONE_DIGITS_MIN = 10
PHONE_DIGITS_MAX = 15

# Common mailbox forms: local-part + domain with at least one dot TLD.
# Allows plus-addressing and dotted locals; rejects spaces and bare domains.
_EMAIL_RE = re.compile(
    r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@"
    r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$"
)

# Digits plus typical phone punctuation only: + - ( ) . and spaces.
_PHONE_ALLOWED_RE = re.compile(r"^[\d\s+().-]+$")


def email_error(email: str | None, *, required: bool = True) -> str | None:
    value = (email or "").strip()
    if not value:
        return "Email is required." if required else None
    if len(value) > EMAIL_MAX:
        return f"Email must be at most {EMAIL_MAX} characters."
    if ".." in value or value.startswith(".") or value.endswith("."):
        return "Enter a valid email address."
    if value.count("@") != 1:
        return "Enter a valid email address."
    local, _, domain = value.partition("@")
    if not local or not domain or domain.startswith(".") or domain.endswith("."):
        return "Enter a valid email address."
    if not _EMAIL_RE.match(value):
        return "Enter a valid email address."
    return None


def phone_error(phone: str | None, *, required: bool = False) -> str | None:
    value = (phone or "").strip()
    if not value:
        return "Phone is required." if required else None
    if len(value) > PHONE_MAX:
        return f"Phone must be at most {PHONE_MAX} characters."
    if not _PHONE_ALLOWED_RE.match(value):
        return "Phone may only include numbers and + - ( ) . or spaces."
    # Leading + is only allowed once, at the start.
    if value.count("+") > 1 or ("+" in value and not value.startswith("+")):
        return "Phone may only include numbers and + - ( ) . or spaces."
    digits = "".join(ch for ch in value if ch.isdigit())
    if len(digits) < PHONE_DIGITS_MIN:
        return f"Enter a valid phone number (at least {PHONE_DIGITS_MIN} digits)."
    if len(digits) > PHONE_DIGITS_MAX:
        return f"Enter a valid phone number (at most {PHONE_DIGITS_MAX} digits)."
    return None
