"""Reject HTML / script markers in free-text portal fields."""

from __future__ import annotations

import re

from fastapi import HTTPException, status

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
SEARCH_MAX = 100


def unsafe_markup_error(value: str | None) -> str | None:
    """Return an error if value contains HTML/script-like content."""
    text = value or ""
    if not text:
        return None
    if _HTML_MARKERS_RE.search(text):
        return SAFE_TEXT_ERROR
    return None


def sanitize_search_query(search: str | None) -> str | None:
    """
    Normalize a search query for API use.
    Raises HTTP 400 if the value contains unsafe markup.
    """
    cleaned = (search or "").strip() or None
    if not cleaned:
        return None
    if len(cleaned) > SEARCH_MAX:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Search must be at most {SEARCH_MAX} characters.",
        )
    err = unsafe_markup_error(cleaned)
    if err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err,
        )
    return cleaned
