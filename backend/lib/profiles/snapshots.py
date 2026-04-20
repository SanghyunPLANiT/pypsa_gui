from __future__ import annotations

from typing import Any

import pandas as pd

from ..config import load_system_defaults
from ..models import RunPayload
from ..utils.coerce import number


def _detect_dayfirst(values: list[str]) -> bool:
    """Heuristic: if any value has a first number > 12 it must be day-first."""
    for v in values[:20]:
        parts = v.replace("/", "-").split("-")
        if len(parts) >= 2:
            try:
                first = int(parts[0])
                if first > 12:
                    return True
                second = int(parts[1])
                if second > 12:
                    return False  # second part > 12 → month-first (mdy)
            except ValueError:
                continue
    return False  # default to ISO / month-first when ambiguous


def workbook_snapshot_index(
    rows: list[dict[str, Any]],
    date_format: str = "auto",
) -> pd.DatetimeIndex | None:
    """Parse workbook snapshot rows as a real DatetimeIndex.
    Returns None for static ('now') or empty models.

    date_format: 'auto' | 'ymd' | 'dmy' | 'mdy'
    """
    if not rows:
        return None
    col = next((k for k in ("snapshot", "name", "datetime") if k in rows[0]), None)
    if col is None:
        return None
    first_val = str(rows[0].get(col) or "").strip().lower()
    if first_val in ("now", ""):
        return None

    raw_values = [str(r[col]) for r in rows]

    if date_format == "ymd":
        # Strict ISO — no dayfirst inference needed
        dayfirst = False
    elif date_format == "dmy":
        dayfirst = True
    elif date_format == "mdy":
        dayfirst = False
    else:
        # auto: try ISO parse first; fall back to heuristic
        try:
            return pd.DatetimeIndex([pd.Timestamp(v) for v in raw_values])
        except Exception:
            dayfirst = _detect_dayfirst(raw_values)

    try:
        return pd.DatetimeIndex(
            pd.to_datetime(raw_values, dayfirst=dayfirst, errors="raise")
        )
    except Exception:
        return None


def snapshot_settings(payload: RunPayload) -> tuple[int, int, int]:
    """Return (window_hours, step, start_offset) for synthetic snapshot generation.

    *window_hours* is the number of hourly steps in the requested window.
    *step* is the temporal resolution: every ``step``-th hourly snapshot is kept
    (e.g. step=4 → 4-hour resolution, matching PyPSA's ``n.snapshots[::4]`` +
    ``n.snapshot_weightings.loc[:, :] = 4`` pattern).
    *start_offset* is the starting hour offset.
    """
    options = payload.options or {}
    max_snapshots = int(load_system_defaults().get("simulation", {}).get("max_snapshots", 8760))
    window = int(max(1, min(max_snapshots, round(number(options.get("snapshotCount"), 24.0)))))
    step = max(1, int(round(number(options.get("snapshotWeight"), 1.0))))
    start = int(max(0, min(max_snapshots - 1, round(number(options.get("snapshotStart"), 0.0)))))
    return window, step, start


def modeled_period_factor(snapshot_count: int, snapshot_weight: float) -> float:
    """Days represented by the model.

    snapshot_count is the number of snapshots *after* downsampling,
    snapshot_weight (= step) is the hours each snapshot represents.
    """
    return snapshot_count * snapshot_weight / 24.0
