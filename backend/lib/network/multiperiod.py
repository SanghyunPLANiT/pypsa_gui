"""
Multi-investment-period network builder for Ragnarok.

Builds a PyPSA network that spans N investment periods using PyPSA's
native multi-investment-period optimisation API.

Flow
----
1. Build a single-period (base-year) network via the existing build_network().
2. Save all time-series data (_t DataFrames) from the base-year network.
3. Construct a pd.MultiIndex of (investment_period_year, timestamp) tuples.
4. Re-set the network snapshots to the MultiIndex.
5. Set investment_period_weightings (years per period, NPV discount weights).
6. Re-assign generator availability and load profiles, applying per-period
   demand growth (or using workbook year columns when available).
7. Write build_year to generators / storage_units from workbook column.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
import pypsa

from ..models import RunPayload
from ..utils.coerce import number
from ..utils.workbook import workbook_rows
from . import build_network   # single-period builder


# ── helpers ───────────────────────────────────────────────────────────────────

def _demand_growth_factor(demand_forecast: dict[str, Any], year: int, base_year: int) -> float:
    """Return the compound demand growth multiplier for a given investment year."""
    annual_pct = number(demand_forecast.get("annualGrowthPct"), 0.0)
    return (1.0 + annual_pct / 100.0) ** (year - base_year)


def _has_year_columns(model: dict[str, list[dict[str, Any]]], years: list[int]) -> list[int]:
    """Return which of *years* appear as column headers in loads-p_set."""
    rows = model.get("loads-p_set") or []
    if not rows:
        return []
    keys = set(rows[0].keys())
    return [yr for yr in years if str(yr) in keys]


def _replicate_ts(
    series: pd.Series,
    investment_periods: list[int],
) -> dict[int, np.ndarray]:
    """Return {year: array} replicating *series* for each investment period."""
    arr = series.values.astype(float)
    return {yr: arr.copy() for yr in investment_periods}


# ── main entry point ──────────────────────────────────────────────────────────

def build_multiperiod_network(payload: RunPayload) -> tuple[pypsa.Network, list[str]]:
    """Build a PyPSA multi-investment-period network from RunPayload.

    payload.options expected keys
    -----------------------------
    investmentPeriods : list[int]   e.g. [2025, 2030, 2035]
    periodLength      : int         years per period, e.g. 5
    snapshotCount     : int         hourly snapshots per period
    snapshotWeight    : int         hour step (temporal resolution)

    payload.scenario expected keys
    ------------------------------
    discountRate   : float          e.g. 0.05
    carbonPrice    : float          $/tCO₂ (same for all periods)
    demandForecast : dict           {annualGrowthPct, peakGrowthPct, floorGrowthPct, baseYear}
    """
    options = payload.options or {}
    scenario = payload.scenario or {}

    investment_periods: list[int] = options.get("investmentPeriods", [])
    if not investment_periods or len(investment_periods) < 2:
        raise ValueError("investmentPeriods must contain at least 2 years.")

    period_length = int(options.get("periodLength", 5))
    discount_rate = float(scenario.get("discountRate", 0.05))
    demand_forecast: dict[str, Any] = scenario.get("demandForecast", {})
    base_year = int(demand_forecast.get("baseYear", investment_periods[0]))

    # ── Step 1: build the single-period (base-year) network ──────────────────
    n, notes = build_network(payload)
    base_snapshots = n.snapshots  # flat DatetimeIndex

    notes.append(
        f"Multi-period expansion: {investment_periods} "
        f"(period_length={period_length}yr, discount_rate={discount_rate:.2%})."
    )

    # ── Step 2: save _t data before re-setting snapshots ─────────────────────
    saved: dict[str, pd.DataFrame] = {}
    for attr in [
        "generators_t.p_max_pu",
        "generators_t.p_min_pu",
        "loads_t.p_set",
        "storage_units_t.inflow",
        "links_t.p_max_pu",
    ]:
        df: pd.DataFrame = _getattr_nested(n, attr)
        if df is not None and not df.empty:
            saved[attr] = df.copy()

    # ── Step 3: build multi-period snapshot MultiIndex ────────────────────────
    tuples: list[tuple[int, pd.Timestamp]] = []
    for yr in investment_periods:
        for ts in base_snapshots:
            # Shift timestamp to the investment period year
            try:
                new_ts = ts.replace(year=yr)
            except ValueError:
                # Feb 29 in a non-leap year — shift to Feb 28
                new_ts = ts.replace(year=yr, day=28)
            tuples.append((yr, new_ts))

    multi_index = pd.MultiIndex.from_tuples(tuples, names=["period", "timestep"])

    # ── Step 4: re-set snapshots on the network ───────────────────────────────
    n.set_snapshots(multi_index)
    n.investment_period_weightings["years"] = float(period_length)

    t0 = investment_periods[0]
    for yr in investment_periods:
        discount_weight = period_length / (1.0 + discount_rate) ** (yr - t0)
        n.investment_period_weightings.loc[yr, "objective"] = discount_weight

    step = max(1, int(round(number(options.get("snapshotWeight"), 1.0))))
    n.snapshot_weightings.loc[:, "objective"] = float(step)
    n.snapshot_weightings.loc[:, "stores"] = float(step)
    n.snapshot_weightings.loc[:, "generators"] = float(step)

    # ── Step 5: re-assign generator time-series (same profile for all periods)
    _restore_ts_all_periods(n, saved, "generators_t.p_max_pu", investment_periods)
    _restore_ts_all_periods(n, saved, "generators_t.p_min_pu", investment_periods)
    _restore_ts_all_periods(n, saved, "storage_units_t.inflow", investment_periods)
    _restore_ts_all_periods(n, saved, "links_t.p_max_pu", investment_periods)

    # ── Step 6: loads with per-period demand growth ───────────────────────────
    detected_year_cols = _has_year_columns(payload.model, investment_periods)

    if "loads_t.p_set" in saved:
        base_load_df = saved["loads_t.p_set"]
        for yr in investment_periods:
            if yr in detected_year_cols:
                # use provided year column — treat as uniform scaling
                yr_rows = payload.model.get("loads-p_set") or []
                notes.append(f"Using workbook loads-p_set year column for {yr}.")
                # for each load component, look for its year-column value
                for col in base_load_df.columns:
                    yr_col_data = np.array([
                        number(row.get(str(yr)), 0.0) for row in yr_rows
                    ], dtype=float)
                    if len(yr_col_data) == len(base_snapshots):
                        n.loads_t.p_set.loc[(yr, slice(None)), col] = yr_col_data
                    else:
                        # fallback to growth rate
                        factor = _demand_growth_factor(demand_forecast, yr, base_year)
                        n.loads_t.p_set.loc[(yr, slice(None)), col] = (
                            base_load_df[col].values * factor
                        )
            else:
                factor = _demand_growth_factor(demand_forecast, yr, base_year)
                for col in base_load_df.columns:
                    n.loads_t.p_set.loc[(yr, slice(None)), col] = (
                        base_load_df[col].values * factor
                    )
        if detected_year_cols:
            notes.append(f"Multi-year load columns detected for years: {detected_year_cols}.")
        else:
            annual_pct = number(demand_forecast.get("annualGrowthPct"), 0.0)
            notes.append(
                f"Demand growth applied: {annual_pct:+.1f}%/yr "
                f"(base {base_year}, periods {investment_periods})."
            )

    # ── Step 7: set build_year on generators from workbook column ─────────────
    for row in workbook_rows(payload.model, "generators"):
        name = str(row.get("name") or "").strip()
        if not name or name not in n.generators.index:
            continue
        raw_by = row.get("build_year")
        if raw_by is not None and raw_by != "":
            by_val = int(number(raw_by, investment_periods[0]))
            n.generators.loc[name, "build_year"] = by_val

    for row in workbook_rows(payload.model, "storage_units"):
        name = str(row.get("name") or "").strip()
        if not name or name not in n.storage_units.index:
            continue
        raw_by = row.get("build_year")
        if raw_by is not None and raw_by != "":
            by_val = int(number(raw_by, investment_periods[0]))
            n.storage_units.loc[name, "build_year"] = by_val

    notes.append(
        f"Multi-period network built: {len(investment_periods)} periods × "
        f"{len(base_snapshots)} snapshots = {len(n.snapshots)} total snapshots."
    )
    return n, notes


# ── utilities ─────────────────────────────────────────────────────────────────

def _getattr_nested(obj: Any, attr_path: str) -> pd.DataFrame | None:
    """Safely access nested attributes like 'generators_t.p_max_pu'."""
    parts = attr_path.split(".")
    for part in parts:
        if obj is None:
            return None
        obj = getattr(obj, part, None)
    return obj  # type: ignore[return-value]


def _restore_ts_all_periods(
    n: pypsa.Network,
    saved: dict[str, pd.DataFrame],
    attr: str,
    investment_periods: list[int],
) -> None:
    """Re-assign a saved _t DataFrame to all investment periods (identical profile)."""
    if attr not in saved:
        return
    df = saved[attr]
    target = _getattr_nested(n, attr)
    if target is None:
        return
    for col in df.columns:
        for yr in investment_periods:
            try:
                target.loc[(yr, slice(None)), col] = df[col].values
            except Exception:
                pass  # column may not be present after snapshot reset
