from __future__ import annotations

from typing import Any

import pandas as pd
import pypsa

from ...utils.coerce import text
from ...utils.series import safe_series


def build_storage_unit_details(network: pypsa.Network) -> dict[str, Any]:
    details: dict[str, Any] = {}
    for unit in network.storage_units.index:
        dispatch = safe_series(network.storage_units_t.p, unit)
        charge = dispatch.clip(upper=0.0).abs()
        discharge = dispatch.clip(lower=0.0)
        state = safe_series(network.storage_units_t.state_of_charge, unit)
        bus = text(network.storage_units.at[unit, "bus"])
        p_nom = float(network.storage_units.at[unit, "p_nom"]) if "p_nom" in network.storage_units.columns else 0.0
        max_hours = float(network.storage_units.at[unit, "max_hours"]) if "max_hours" in network.storage_units.columns else 0.0

        dispatch_s, charge_s, discharge_s, state_s = [], [], [], []
        for snapshot in network.snapshots:
            ts = pd.Timestamp(snapshot)
            label, stamp = ts.strftime("%H:%M"), ts.isoformat()
            dispatch_s.append({"label": label, "timestamp": stamp, "dispatch": float(dispatch.loc[snapshot])})
            charge_s.append({"label": label, "timestamp": stamp, "charge": float(charge.loc[snapshot])})
            discharge_s.append({"label": label, "timestamp": stamp, "discharge": float(discharge.loc[snapshot])})
            state_s.append({"label": label, "timestamp": stamp, "state": float(state.loc[snapshot])})

        details[unit] = {
            "name": unit, "bus": bus,
            "summary": [
                {"label": "Power rating", "value": f"{round(p_nom):,} MW", "detail": "Storage unit dispatch limit"},
                {"label": "Energy capacity", "value": f"{round(p_nom * max_hours):,} MWh", "detail": f"{max_hours:.1f} h max_hours"},
                {"label": "Peak state", "value": f"{round(float(state.max())):,} MWh", "detail": "Maximum state of charge"},
            ],
            "dispatchSeries": dispatch_s,
            "chargeSeries": charge_s,
            "dischargeSeries": discharge_s,
            "stateSeries": state_s,
        }
    return details
