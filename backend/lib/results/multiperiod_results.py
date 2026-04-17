"""
Multi-year investment result extraction for Ragnarok.

Called after network.optimize(multi_investment_periods=True) completes.
Returns a serialisable dict suitable for the frontend MultiYearResults type.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
import pypsa


def build_multiyear_results(
    network: pypsa.Network,
    investment_periods: list[int],
    period_length: int,
    discount_rate: float,
) -> dict[str, Any]:
    """Extract per-period results from a solved multi-period PyPSA network.

    Returns
    -------
    dict with keys:
        periods         : list of per-period dicts
        totalNpvM       : float — NPV of all costs in $M
        narrative       : list[str]
        runMeta         : dict
    """
    notes: list[str] = []

    # Discount factors (NPV weighting per period)
    t0 = investment_periods[0]
    discount_factors = {
        yr: period_length / (1.0 + discount_rate) ** (yr - t0)
        for yr in investment_periods
    }

    periods_out: list[dict[str, Any]] = []
    total_npv = 0.0

    # Carrier colour mapping (for consistency with frontend)
    from ..constants import CARRIER_COLORS

    for yr in investment_periods:
        yr_idx = (yr, slice(None))   # MultiIndex slicer for this period

        # ── New capacity (assets built this period) ───────────────────────────
        new_cap_mw: dict[str, float] = {}
        _collect_new_capacity(network, yr, new_cap_mw, "generators")
        _collect_new_capacity(network, yr, new_cap_mw, "storage_units")

        # ── Total active capacity per carrier ─────────────────────────────────
        total_cap_mw: dict[str, float] = {}
        _collect_active_capacity(network, yr, total_cap_mw, "generators")
        _collect_active_capacity(network, yr, total_cap_mw, "storage_units")

        # ── Annualised CAPEX ($M) ─────────────────────────────────────────────
        capex_m = 0.0
        for df, component in [
            (network.generators, "generators"),
            (network.storage_units, "storage_units"),
        ]:
            ext_mask = df.get("p_nom_extendable", pd.Series(dtype=bool)).fillna(False).astype(bool)
            if not ext_mask.any():
                continue
            ext_df = df[ext_mask]
            for name in ext_df.index:
                build_year = int(ext_df.at[name, "build_year"]) if "build_year" in ext_df.columns else t0
                if build_year != yr:
                    continue
                p_nom_opt = float(ext_df.at[name, "p_nom_opt"]) if "p_nom_opt" in ext_df.columns else 0.0
                cap_cost = float(ext_df.at[name, "capital_cost"])  # annualised $/MW/yr
                capex_m += cap_cost * p_nom_opt / 1e6

        # ── Operational cost ($M) for this period ─────────────────────────────
        opex_m = 0.0
        try:
            mc = network.generators["marginal_cost"]
            gen_p = network.generators_t.p.loc[yr_idx] if not network.generators_t.p.empty else pd.DataFrame()
            sw = network.snapshot_weightings.loc[yr_idx, "objective"] if not network.snapshot_weightings.empty else pd.Series(1.0, index=gen_p.index)
            if not gen_p.empty and len(gen_p) > 0:
                weighted = gen_p.multiply(sw.values, axis=0)
                opex_m = float((weighted * mc).sum().sum()) / 1e6
        except Exception:
            opex_m = 0.0

        # ── Average SMP (/MWh) ────────────────────────────────────────────────
        avg_smp = 0.0
        try:
            mp = network.buses_t.marginal_price
            if not mp.empty:
                period_mp = mp.loc[yr_idx]
                avg_smp = float(period_mp.mean().mean())
        except Exception:
            avg_smp = 0.0

        period_cost = capex_m + opex_m
        total_npv += period_cost * discount_factors[yr]

        periods_out.append({
            "year": yr,
            "newCapacityMw": new_cap_mw,
            "totalCapacityMw": total_cap_mw,
            "capexM": round(capex_m, 3),
            "opexM": round(opex_m, 3),
            "avgSmpPerMwh": round(avg_smp, 2),
        })

        notes.append(
            f"Period {yr}: new cap={sum(new_cap_mw.values()):.0f} MW, "
            f"CAPEX={capex_m:.1f}$M, OPEX={opex_m:.1f}$M, avg SMP={avg_smp:.1f}$/MWh."
        )

    snap_count_base = len(network.snapshots) // len(investment_periods)
    snap_weight = 1
    try:
        sw_vals = network.snapshot_weightings["objective"]
        if not sw_vals.empty:
            snap_weight = int(sw_vals.iloc[0])
    except Exception:
        snap_weight = 1

    return {
        "periods": periods_out,
        "totalNpvM": round(total_npv, 3),
        "narrative": notes,
        "runMeta": {
            "investmentPeriods": investment_periods,
            "snapshotCount": snap_count_base,
            "snapshotWeight": snap_weight,
        },
    }


# ── helpers ───────────────────────────────────────────────────────────────────

def _collect_new_capacity(
    network: pypsa.Network,
    year: int,
    out: dict[str, float],
    component: str,
) -> None:
    """Add newly built capacity (build_year == year) to *out* keyed by carrier."""
    df = getattr(network, component, None)
    if df is None or df.empty:
        return
    ext_mask = df.get("p_nom_extendable", pd.Series(dtype=bool)).fillna(False).astype(bool)
    if not ext_mask.any():
        return
    ext_df = df[ext_mask]
    for name in ext_df.index:
        build_year = int(ext_df.at[name, "build_year"]) if "build_year" in ext_df.columns else year
        if build_year != year:
            continue
        p_nom_opt = float(ext_df.at[name, "p_nom_opt"]) if "p_nom_opt" in ext_df.columns else 0.0
        carrier = str(ext_df.at[name, "carrier"]) if "carrier" in ext_df.columns else "Unknown"
        out[carrier] = out.get(carrier, 0.0) + p_nom_opt


def _collect_active_capacity(
    network: pypsa.Network,
    year: int,
    out: dict[str, float],
    component: str,
) -> None:
    """Add total p_nom_opt for assets active in *year* to *out* keyed by carrier."""
    df = getattr(network, component, None)
    if df is None or df.empty:
        return
    for name in df.index:
        if "build_year" in df.columns:
            by = int(df.at[name, "build_year"])
            lifetime = float(df.at[name, "lifetime"]) if "lifetime" in df.columns else 9999.0
            if not (by <= year < by + lifetime):
                continue
        p_nom = (
            float(df.at[name, "p_nom_opt"])
            if ("p_nom_extendable" in df.columns and df.at[name, "p_nom_extendable"] and "p_nom_opt" in df.columns)
            else float(df.at[name, "p_nom"])
        )
        carrier = str(df.at[name, "carrier"]) if "carrier" in df.columns else "Unknown"
        # Skip system generators
        if name.startswith("load_shedding_") or name == "grid_imports":
            continue
        out[carrier] = out.get(carrier, 0.0) + p_nom
