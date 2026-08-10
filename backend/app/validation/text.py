"""Reject HTML / script markers in free-text portal fields."""

from __future__ import annotations

import re

# Angle brackets and common XSS vectors in plain-text profile fields.
_HTML_MARKERS_RE = re.compile(
    r"<|>|"
    r"javascript\s*:|"
    r"vbscript\s*:|"
    r"data\s*:\s*text\s*/\s*html|"
    r"on[a-z]+\s*=|"
    r"<\s*/?\s*script|"
    r"<\s*/?\s*iframe|"
    r"<\s*/?\s*object|"
    r"<\s*/?\s*embed|"
    r"<\s*/?\s*svg|"
    r"<\s*/?\s*img|"
    r"<\s*/?\s*link|"
    r"<\s*/?\s*meta|"
    r"<\s*/?\s*style",
    re.IGNORECASE,
)

SAFE_TEXT_ERROR = "HTML, scripts, or unsafe markup are not allowed."


def unsafe_markup_error(value: str | None) -> str | None:
    """Return an error if value contains HTML/script-like content."""
    text = value or ""
    if not text:
        return None
    if _HTML_MARKERS_RE.search(text):
        return SAFE_TEXT_ERROR
    return None
