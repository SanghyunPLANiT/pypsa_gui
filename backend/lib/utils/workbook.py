from __future__ import annotations

from typing import Any

import pandas as pd

from .coerce import number


def workbook_rows(model: dict[str, list[dict[str, Any]]], sheet: str) -> list[dict[str, Any]]:
    return list(model.get(sheet, []))


def apply_scaled_static_attributes(
    frame: pd.DataFrame,
    name: str,
    row: dict[str, Any],
    scale_factor: float,
) -> list[str]:
    """Scale *_sum_min / *_sum_max attributes in-place; return names of applied keys."""
    applied: list[str] = []
    for key, raw_value in row.items():
        if key not in frame.columns:
            continue
        if raw_value in (None, ""):
            continue
        if key.endswith("_sum_min") or key.endswith("_sum_max"):
            frame.at[name, key] = number(raw_value) * scale_factor
            applied.append(key)
    return applied
