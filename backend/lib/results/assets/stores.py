from __future__ import annotations

from typing import Any

import pandas as pd
import pypsa

from ...utils.coerce import text
from ...utils.series import safe_series


def build_store_details(network: pypsa.Network) -> dict[str, Any]:
    details: dict[str, Any] = {}
    if not hasattr(network, "stores_t"):
        return details
    for store in network.stores.index:
        bus = text(network.stores.at[store, "bus"])
        e_nom = float(network.stores.at[store, "e_nom"]) if "e_nom" in network.stores.columns else 0.0
        energy = safe_series(network.stores_t.e, store) if hasattr(network.stores_t, "e") else pd.Series(0.0, index=network.snapshots)
        power = safe_series(network.stores_t.p, store) if hasattr(network.stores_t, "p") else pd.Series(0.0, index=network.snapshots)

        energy_s, power_s = [], []
        for snapshot in network.snapshots:
            ts = pd.Timestamp(snapshot)
            label, stamp = ts.strftime("%H:%M"), ts.isoformat()
            energy_s.append({"label": label, "timestamp": stamp, "energy": float(energy.loc[snapshot])})
            power_s.append({"label": label, "timestamp": stamp, "power": float(power.loc[snapshot])})

        details[store] = {
            "name": store, "bus": bus,
            "summary": [
                {"label": "Energy rating", "value": f"{round(e_nom):,} MWh", "detail": "Store nominal energy"},
                {"label": "Peak energy", "value": f"{round(float(energy.max())):,} MWh", "detail": "Maximum stored energy"},
                {"label": "Peak power", "value": f"{round(float(power.abs().max())):,} MW", "detail": "Maximum absolute store power"},
            ],
            "energySeries": energy_s,
            "powerSeries": power_s,
        }
    return details
