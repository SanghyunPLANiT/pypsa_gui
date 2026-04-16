from __future__ import annotations

from typing import Any

import pandas as pd
import pypsa

from ...utils.coerce import text
from ...utils.series import safe_series


def _snapshot_rows(
    network: pypsa.Network, p0_s: pd.Series, p1_s: pd.Series, capacity: float
) -> tuple[list[dict], list[dict], list[dict]]:
    flow_s, loading_s, losses_s = [], [], []
    for snapshot in network.snapshots:
        p0 = float(p0_s.loc[snapshot])
        p1 = float(p1_s.loc[snapshot])
        ts = pd.Timestamp(snapshot)
        label, stamp = ts.strftime("%H:%M"), ts.isoformat()
        flow_s.append({"label": label, "timestamp": stamp, "p0": p0, "p1": p1})
        loading_s.append({"label": label, "timestamp": stamp, "loading": max(abs(p0), abs(p1)) / capacity * 100.0})
        losses_s.append({"label": label, "timestamp": stamp, "losses": abs(p0 + p1)})
    return flow_s, loading_s, losses_s


def _peak_loading(p0_s: pd.Series, p1_s: pd.Series, capacity: float, snapshots: Any) -> int:
    return round(max(max(abs(float(p0_s.loc[s])), abs(float(p1_s.loc[s]))) / capacity * 100.0 for s in snapshots))


def build_branch_details(network: pypsa.Network) -> dict[str, Any]:
    details: dict[str, Any] = {}

    if not network.lines_t.p0.empty:
        for line in network.lines.index:
            s_nom = max(float(network.lines.at[line, "s_nom"]), 1.0)
            p0_s = safe_series(network.lines_t.p0, line)
            p1_s = safe_series(network.lines_t.p1, line)
            flow_s, loading_s, losses_s = _snapshot_rows(network, p0_s, p1_s, s_nom)
            details[line] = {
                "name": line, "component": "line",
                "bus0": text(network.lines.at[line, "bus0"]),
                "bus1": text(network.lines.at[line, "bus1"]),
                "summary": [
                    {"label": "Thermal rating", "value": f"{round(s_nom):,} MVA", "detail": "Static line rating"},
                    {"label": "Peak flow", "value": f"{round(max(float(p0_s.abs().max()), float(p1_s.abs().max()))):,} MW", "detail": "Maximum terminal flow"},
                    {"label": "Peak loading", "value": f"{_peak_loading(p0_s, p1_s, s_nom, network.snapshots):,}%", "detail": "Maximum utilization"},
                ],
                "flowSeries": flow_s, "loadingSeries": loading_s, "lossesSeries": losses_s,
            }

    if not network.links_t.p0.empty:
        for link in network.links.index:
            p_nom = max(float(network.links.at[link, "p_nom"]), 1.0)
            p0_s = safe_series(network.links_t.p0, link)
            p1_s = safe_series(network.links_t.p1, link)
            flow_s, loading_s, losses_s = _snapshot_rows(network, p0_s, p1_s, p_nom)
            details[link] = {
                "name": link, "component": "link",
                "bus0": text(network.links.at[link, "bus0"]),
                "bus1": text(network.links.at[link, "bus1"]),
                "summary": [
                    {"label": "Transfer rating", "value": f"{round(p_nom):,} MW", "detail": "Static link rating"},
                    {"label": "Peak flow", "value": f"{round(max(float(p0_s.abs().max()), float(p1_s.abs().max()))):,} MW", "detail": "Maximum terminal flow"},
                    {"label": "Peak loading", "value": f"{_peak_loading(p0_s, p1_s, p_nom, network.snapshots):,}%", "detail": "Maximum utilization"},
                ],
                "flowSeries": flow_s, "loadingSeries": loading_s, "lossesSeries": losses_s,
            }

    if not network.transformers_t.p0.empty:
        for transformer in network.transformers.index:
            s_nom = max(float(network.transformers.at[transformer, "s_nom"]), 1.0)
            p0_s = safe_series(network.transformers_t.p0, transformer)
            p1_s = safe_series(network.transformers_t.p1, transformer)
            flow_s, loading_s, losses_s = _snapshot_rows(network, p0_s, p1_s, s_nom)
            details[transformer] = {
                "name": transformer, "component": "transformer",
                "bus0": text(network.transformers.at[transformer, "bus0"]),
                "bus1": text(network.transformers.at[transformer, "bus1"]),
                "summary": [
                    {"label": "Transfer rating", "value": f"{round(s_nom):,} MVA", "detail": "Static transformer rating"},
                    {"label": "Peak flow", "value": f"{round(max(float(p0_s.abs().max()), float(p1_s.abs().max()))):,} MW", "detail": "Maximum terminal flow"},
                    {"label": "Peak loading", "value": f"{_peak_loading(p0_s, p1_s, s_nom, network.snapshots):,}%", "detail": "Maximum utilization"},
                ],
                "flowSeries": flow_s, "loadingSeries": loading_s, "lossesSeries": losses_s,
            }

    return details
