from __future__ import annotations

from typing import Any

import pandas as pd

from ..config import load_system_defaults
from ..models import RunPayload
from ..utils.coerce import number


def workbook_snapshot_index(rows: list[dict[str, Any]]) -> pd.DatetimeIndex | None:
    """Parse workbook snapshot rows as a real DatetimeIndex.
    Returns None for static ('now') or empty models."""
    if not rows:
        return None
    col = next((k for k in ("snapshot", "name", "datetime") if k in rows[0]), None)
    if col is None:
        return None
    first_val = str(rows[0].get(col) or "").strip().lower()
    if first_val in ("now", ""):
        return None
    try:
        return pd.DatetimeIndex([pd.Timestamp(str(r[col])) for r in rows])
    except Exception:
        return None


def snapshot_settings(payload: RunPayload) -> tuple[int, float, int]:
    """Return (count, weight, start_offset) for synthetic snapshot generation."""
    options = payload.options or {}
    max_snapshots = int(load_system_defaults().get("simulation", {}).get("max_snapshots", 8760))
    count = int(max(1, min(max_snapshots, round(number(options.get("snapshotCount"), 24.0)))))
    weight = max(0.1, number(options.get("snapshotWeight"), 1.0))
    start = int(max(0, min(max_snapshots - 1, round(number(options.get("snapshotStart"), 0.0)))))
    return count, weight, start


def modeled_period_factor(snapshot_count: int, snapshot_weight: float) -> float:
    return snapshot_count * snapshot_weight / 24.0
