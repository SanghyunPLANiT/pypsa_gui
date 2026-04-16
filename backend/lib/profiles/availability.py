from __future__ import annotations

import numpy as np
import pandas as pd

from ..config import load_system_defaults


def availability_profile(carrier: str, snapshots: pd.Index) -> pd.Series:
    """Return a per-carrier availability (p.u.) series for the given snapshots."""
    hours = np.arange(len(snapshots))
    cfg = load_system_defaults().get("availability_profiles", {})
    profile_cfg = cfg.get(carrier)

    if profile_cfg is None:
        return pd.Series(np.ones_like(hours, dtype=float), index=snapshots)

    ptype = profile_cfg.get("type")

    if ptype == "sinusoidal":
        peak_hour = float(profile_cfg.get("peak_hour", 12))
        half_width = float(profile_cfg.get("half_width_hours", 6))
        values = np.clip(np.sin(((hours - (peak_hour - half_width)) / (2 * half_width)) * np.pi), 0, 1)

    elif ptype == "sinusoidal_offset":
        amplitude = float(profile_cfg.get("amplitude", 0.1))
        base = float(profile_cfg.get("base", 0.5))
        period = float(profile_cfg.get("period_hours", 24))
        phase = float(profile_cfg.get("phase_rad", 0.0))
        clip_min = float(profile_cfg.get("clip_min", 0.0))
        clip_max = float(profile_cfg.get("clip_max", 1.0))
        values = np.clip(base + amplitude * np.sin((hours / period) * 2 * np.pi + phase), clip_min, clip_max)

    else:
        values = np.ones_like(hours, dtype=float)

    return pd.Series(values, index=snapshots)
