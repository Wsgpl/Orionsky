"""Helpers for classifying aircraft records from external providers."""
from __future__ import annotations

def normalize_label(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def first_present_label(*values: object) -> str | None:
    for value in values:
        label = normalize_label(value)
        if label:
            return label
    return None
