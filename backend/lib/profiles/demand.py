from __future__ import annotations

import numpy as np
import pandas as pd

from ..config import load_system_defaults


def _resample(values: np.ndarray, periods: int) -> np.ndarray:
    if periods <= 1:
        return np.array([float(values[0])], dtype=float)
    src = np.linspace(0.0, len(values) - 1, num=len(values))
    tgt = np.linspace(0.0, len(values) - 1, num=periods)
    return np.interp(tgt, src, values)


def demand_profile(periods: int, start_offset: int = 0) -> pd.Series:
    """Return a normalised hourly demand profile, optionally offset by start_offset hours."""
    cfg = load_system_defaults()["demand_profile"]
    start_date: str = cfg["start_date"]
    base_shape = np.array(cfg["base_shape_24h"], dtype=float)
    # Tile the 24h shape enough times to cover offset + periods
    total_needed = start_offset + periods
    reps = (total_needed // len(base_shape)) + 2
    tiled = np.tile(base_shape, reps)
    window = tiled[start_offset: start_offset + periods]
    start_ts = pd.Timestamp(start_date) + pd.Timedelta(hours=start_offset)
    snapshots = pd.date_range(start_ts, periods=periods, freq="h")
    return pd.Series(window.astype(float), index=snapshots)
