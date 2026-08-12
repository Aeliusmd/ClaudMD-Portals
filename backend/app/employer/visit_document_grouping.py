"""Group DocterPublishes rows into current visit documents with previous versions."""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime
from typing import Any, Callable, TypeVar

from app.employer.schemas import VisitDocumentPreviousVersion

_VERSION_RE = re.compile(r"[\\/]V(\d+)\s*$", re.IGNORECASE)

T = TypeVar("T")


def version_tag_from_path(path: str | None) -> str | None:
    if not path:
        return None
    match = _VERSION_RE.search(str(path).strip())
    if not match:
        return None
    return f"V{match.group(1)}"


def version_number_from_path(path: str | None) -> int:
    if not path:
        return 0
    match = _VERSION_RE.search(str(path).strip())
    if not match:
        return 0
    try:
        return int(match.group(1))
    except (TypeError, ValueError):
        return 0


def normalize_publish_datetime(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    text = str(value).strip()
    return text or None


def publish_sort_key(row: dict[str, Any]) -> tuple[int, str, int]:
    path = (row.get("Path") or row.get("path") or "").strip()
    version = version_number_from_path(path)
    created = normalize_publish_datetime(
        row.get("CreatedDateTime") or row.get("created_datetime")
    ) or ""
    row_id = row.get("Id") or row.get("id") or 0
    try:
        row_id = int(row_id)
    except (TypeError, ValueError):
        row_id = 0
    return (version, created, row_id)


def _group_key(row: dict[str, Any]) -> tuple[int, str]:
    check_in_id = int(row["CheckInId"])
    report_id = row.get("ReportId")
    if report_id is not None:
        try:
            return (check_in_id, f"report:{int(report_id)}")
        except (TypeError, ValueError):
            pass
    report_name = (
        (row.get("ReportName") or "").strip()
        or (row.get("ReportTableName") or "").strip()
        or (row.get("ReportTitle") or "").strip()
        or (row.get("Name") or "").strip()
        or "document"
    )
    return (check_in_id, f"name:{report_name.lower()}")


def build_grouped_visit_documents(
    rows: list[dict[str, Any]],
    *,
    row_to_document: Callable[[dict[str, Any]], T | None],
) -> list[T]:
    """
    Collapse multiple publishes of the same report into one current document.
    Older publishes (lower V tag or earlier CreatedDateTime) become previous_versions.
    """
    grouped: dict[tuple[int, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[_group_key(row)].append(row)

    documents: list[T] = []
    for group_rows in grouped.values():
        ordered = sorted(group_rows, key=publish_sort_key, reverse=True)
        current_doc = None
        current_index = 0
        for index, row in enumerate(ordered):
            current_doc = row_to_document(row)
            if current_doc is not None:
                current_index = index
                break
        if current_doc is None:
            continue

        previous_versions: list[VisitDocumentPreviousVersion] = []
        seen_version_keys: set[str] = set()
        for older in ordered[current_index + 1 :]:
            older_id = older.get("Id") or older.get("id")
            if older_id is None:
                continue
            version_path = ((older.get("Path") or older.get("path") or "").strip())
            version_tag = version_tag_from_path(version_path)
            dedupe_key = version_path.lower() or version_tag or str(older_id)
            if dedupe_key in seen_version_keys:
                continue
            seen_version_keys.add(dedupe_key)
            previous_versions.append(
                VisitDocumentPreviousVersion(
                    id=int(older_id),
                    published_at=normalize_publish_datetime(
                        older.get("CreatedDateTime") or older.get("created_datetime")
                    ),
                    version_tag=version_tag,
                    path=version_path or None,
                )
            )
        # Oldest version first for pile UI (V1, V2, …).
        previous_versions.sort(
            key=lambda item: (
                version_number_from_path(item.path),
                item.published_at or "",
                item.id,
            )
        )

        if hasattr(current_doc, "model_copy"):
            current_doc = current_doc.model_copy(
                update={"previous_versions": previous_versions}
            )
        else:
            setattr(current_doc, "previous_versions", previous_versions)
        documents.append(current_doc)

    documents.sort(key=lambda doc: int(getattr(doc, "id", 0) or 0))
    return documents
