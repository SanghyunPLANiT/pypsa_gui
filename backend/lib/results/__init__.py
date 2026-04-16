from __future__ import annotations

from collections import defaultdict
from typing import Any

import numpy as np
import pandas as pd
from fastapi import HTTPException

from ..constants import CARRIER_COLORS
from ..models import RunPayload
from ..network import build_network
from ..profiles import snapshot_settings
from ..utils.series import weighted_sum
from .assets import (
    build_branch_details,
    build_bus_details,
    build_generator_details,
    build_storage_unit_details,
    build_store_details,
)
from ..network.custom_constraints import apply_custom_constraints
from .dispatch import (
    build_dispatch_series,
    build_price_emissions_series,
    build_storage_series,
    dispatch_by_carrier,
)


def run_pypsa(payload: RunPayload) -> dict[str, Any]:
    network, notes = build_network(payload)
    scenario = payload.scenario
    snapshot_count, snapshot_weight, _start = snapshot_settings(payload)
    emissions_factors: dict[str, float] = (
        network.carriers["co2_emissions"].to_dict()
        if "co2_emissions" in network.carriers.columns
        else {}
    )

    re_target = float(scenario.get("renewableTarget", 0.0))
    custom_constraints: list[dict] = scenario.get("constraints") or []

    def extra_functionality(n, snapshots):
        # 1. Scenario-level RE target (params slider)
        if re_target > 0:
            try:
                re_carriers = {"Solar", "Wind", "Hydro"}
                re_gens = n.generators.index[n.generators.carrier.isin(re_carriers)].tolist()
                supply_gens = [
                    g for g in n.generators.index
                    if not g.startswith("load_shedding_") and g != "grid_imports"
                ]
                if not re_gens or not supply_gens:
                    notes.append(
                        f"RE target {re_target:.0f}% requested but no renewable generators found — "
                        "share constraint skipped."
                    )
                else:
                    weights = n.snapshot_weightings["generators"]
                    gen_p = n.model["Generator-p"]
                    dim = [d for d in gen_p.dims if d != "snapshot"][0]
                    re_total = (gen_p.sel({dim: re_gens}) * weights).sum()
                    all_total = (gen_p.sel({dim: supply_gens}) * weights).sum()
                    n.model.add_constraints(
                        re_total >= (re_target / 100.0) * all_total, name="scenario_re_target"
                    )
                    notes.append(f"Scenario RE target: RE ≥ {re_target:.0f}% of total dispatch.")
            except Exception as exc:
                notes.append(f"Could not add RE target constraint: {exc}")

        # 2. Custom constraints panel
        apply_custom_constraints(n, custom_constraints, emissions_factors, notes)

    try:
        network.optimize(solver_name="highs", extra_functionality=extra_functionality)
        notes.append("PyPSA optimize() solved with HiGHS.")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PyPSA optimization failed: {exc}") from exc

    generator_dispatch_frame = network.generators_t.p.copy()
    dispatch_frame = generator_dispatch_frame.copy()
    if hasattr(network, "storage_units_t") and not network.storage_units_t.p.empty:
        dispatch_frame = pd.concat([dispatch_frame, network.storage_units_t.p], axis=1)

    by_carrier = dispatch_by_carrier(generator_dispatch_frame, network.generators)
    load_dispatch = network.loads_t.p_set.sum(axis=1)
    price_series = (
        network.buses_t.marginal_price.mean(axis=1)
        if not network.buses_t.marginal_price.empty
        else pd.Series(0.0, index=network.snapshots)
    )
    shed_cols = [n for n in network.generators.index if n.startswith("load_shedding_")]
    load_shed = dispatch_frame.reindex(columns=shed_cols, fill_value=0.0).sum(axis=1)
    generator_weights = network.snapshot_weightings["generators"].reindex(network.snapshots).fillna(1.0)
    store_weights = network.snapshot_weightings["stores"].reindex(network.snapshots).fillna(1.0)

    # Capacity & energy metrics
    total_capacity = float(network.generators.p_nom.sum() + network.storage_units.p_nom.sum())
    renewable_capacity = float(
        network.generators.loc[network.generators.carrier.isin(["Solar", "Wind", "Hydro"]), "p_nom"].sum()
        + network.storage_units.p_nom.sum()
    )
    renewable_share = (renewable_capacity / total_capacity * 100.0) if total_capacity else 0.0
    total_load = float(load_dispatch.max())
    reserve_requirement = total_load * (1.0 + float(scenario.get("reserveMargin", 0.0)) / 100.0)

    emission_totals: dict[str, float] = defaultdict(float)
    carrier_energy: dict[str, float] = defaultdict(float)
    for carrier, series in by_carrier.items():
        positive = series.clip(lower=0.0)
        carrier_energy[carrier] += weighted_sum(positive, generator_weights)
        emission_totals[carrier] += weighted_sum(positive * emissions_factors.get(carrier, 0.0), generator_weights)

    carrier_mix = [
        {"label": c, "value": v, "color": CARRIER_COLORS.get(c, "#94a3b8")}
        for c, v in sorted(carrier_energy.items(), key=lambda x: x[1], reverse=True)
        if v > 0.0
    ]

    # Cost breakdown
    fuel_cost = 0.0
    carbon_cost = 0.0
    shed_cost = 0.0
    for name in network.generators.index:
        if name not in generator_dispatch_frame.columns:
            continue
        mc = float(network.generators.at[name, "marginal_cost"])
        dispatch_mwh = weighted_sum(generator_dispatch_frame[name].clip(lower=0.0), generator_weights)
        carrier = network.generators.at[name, "carrier"]
        ef = emissions_factors.get(carrier, 0.0)
        carbon_c = float(scenario.get("carbonPrice", 0.0))
        carbon_component = dispatch_mwh * ef * carbon_c
        fuel_component = dispatch_mwh * max(0.0, mc - ef * carbon_c)
        if name.startswith("load_shedding_"):
            shed_cost += dispatch_mwh * mc
        else:
            fuel_cost += fuel_component
            carbon_cost += carbon_component

    cost_breakdown = [
        {"label": "Fuel cost", "value": round(fuel_cost)},
        {"label": "Carbon cost", "value": round(carbon_cost)},
        {"label": "Load shedding", "value": round(shed_cost)},
    ]

    # Series
    dispatch_s, gen_dispatch_s = build_dispatch_series(network, by_carrier, load_dispatch, generator_dispatch_frame)
    price_s, emissions_s = build_price_emissions_series(network, by_carrier, price_series, emissions_factors)
    storage_s = build_storage_series(network)

    # Nodal balance
    nodal_balance = []
    for bus in network.buses.index:
        bus_loads = network.loads.index[network.loads.bus == bus]
        load_val = float(network.loads_t.p_set.loc[:, bus_loads].sum(axis=1).mean()) if len(bus_loads) else 0.0
        gen_names = list(network.generators.index[network.generators.bus == bus])
        gen_val = float(dispatch_frame.reindex(columns=gen_names, fill_value=0.0).sum(axis=1).mean()) if gen_names else 0.0
        nodal_balance.append({"label": bus, "load": load_val, "generation": gen_val})
    nodal_balance = sorted(nodal_balance, key=lambda x: x["load"], reverse=True)[:12]

    # Line loading
    line_loading = []
    for line in network.lines.index if not network.lines_t.p0.empty else []:
        peak = float((network.lines_t.p0[line].abs() / max(float(network.lines.at[line, "s_nom"]), 1.0) * 100.0).max())
        line_loading.append({"label": line, "value": peak})
    for link in network.links.index if not network.links_t.p0.empty else []:
        peak = float((network.links_t.p0[link].abs() / max(float(network.links.at[link, "p_nom"]), 1.0) * 100.0).max())
        line_loading.append({"label": link, "value": peak})
    for transformer in network.transformers.index:
        if not network.transformers_t.p0.empty:
            peak = float((network.transformers_t.p0[transformer].abs() / max(float(network.transformers.at[transformer, "s_nom"]), 1.0) * 100.0).max())
            line_loading.append({"label": transformer, "value": peak})

    total_emissions = sum(emission_totals.values()) / 1000.0
    average_price = float(price_series.mean())
    solar_s = by_carrier.get("Solar", pd.Series(0.0, index=network.snapshots))
    wind_s = by_carrier.get("Wind", pd.Series(0.0, index=network.snapshots))
    peak_net_load = round(float((load_dispatch - solar_s - wind_s).max()))
    renewable_dispatch_share = round(
        sum(v["value"] for v in carrier_mix if v["label"] in {"Solar", "Wind", "Hydro", "Storage"})
        / max(sum(v["value"] for v in carrier_mix), 1.0) * 100.0
    )

    summary = [
        {"label": "Installed capacity", "value": f"{round(total_capacity):,} MW", "detail": f"{round(renewable_share)}% renewable capacity share"},
        {"label": "Peak demand", "value": f"{round(total_load):,} MW", "detail": f"{float(scenario.get('demandGrowth', 0.0)):.1f}% growth vs workbook load"},
        {"label": "Reserve position", "value": f"{round(total_capacity - reserve_requirement):,} MW", "detail": f"Reserve margin target {float(scenario.get('reserveMargin', 0.0)):.0f}%"},
        {"label": "Peak price", "value": f"{round(float(price_series.max())):,} $/MWh", "detail": f"{peak_net_load:,} MW peak net load"},
        {"label": "System emissions", "value": f"{round(total_emissions):,} ktCO2e", "detail": f"Carbon price {float(scenario.get('carbonPrice', 0.0)):.0f} $/t"},
        {"label": "Transmission stress", "value": f"{round(np.mean([x['value'] for x in line_loading]) if line_loading else 0):,}%", "detail": f"{sum(1 for x in line_loading if x['value'] > 80.0)} corridors above 80%"},
    ]

    notes.extend([
        f"Backend PyPSA run solved {len(network.snapshots)} hourly snapshots with {len(network.generators)} generators and {len(network.loads)} loads.",
        f"Average price settled at {average_price:.1f} $/MWh and peaked at {float(price_series.max()):.1f} $/MWh.",
        f"Load shedding totalled {float(load_shed.sum()):.2f} MWh across the day.",
        f"Renewable energy share in dispatch reached {renewable_dispatch_share}%.",
    ])

    return {
        "summary": summary,
        "dispatchSeries": dispatch_s,
        "generatorDispatchSeries": gen_dispatch_s,
        "systemPriceSeries": price_s,
        "systemEmissionsSeries": emissions_s,
        "storageSeries": storage_s,
        "carrierMix": carrier_mix,
        "costBreakdown": cost_breakdown,
        "nodalBalance": nodal_balance,
        "lineLoading": line_loading,
        "narrative": notes,
        "runMeta": {
            "snapshotCount": snapshot_count,
            "snapshotWeight": snapshot_weight,
            "modeledHours": snapshot_count * snapshot_weight,
            "storeWeight": float(store_weights.iloc[0]) if len(store_weights) else snapshot_weight,
        },
        "assetDetails": {
            "generators": build_generator_details(network, dispatch_frame, generator_weights, emissions_factors),
            "buses": build_bus_details(network, dispatch_frame, generator_weights, emissions_factors),
            "storageUnits": build_storage_unit_details(network),
            "stores": build_store_details(network),
            "branches": build_branch_details(network),
        },
    }
