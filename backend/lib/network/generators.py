from __future__ import annotations

from typing import Any

import pandas as pd
import pypsa

from ..config import load_system_defaults
from ..utils.coerce import number, text
from ..utils.workbook import apply_scaled_static_attributes, workbook_rows
from .buses import parse_ts_sheet


def _carrier_emissions(network: pypsa.Network, carrier: str) -> float:
    if carrier in network.carriers.index and "co2_emissions" in network.carriers.columns:
        return float(network.carriers.at[carrier, "co2_emissions"])
    return 0.0


def add_generators(
    network: pypsa.Network,
    model: dict[str, list[dict[str, Any]]],
    snapshots: pd.Index,
    period_factor: float,
    renewable_multiplier: float,
    carbon_price: float,
    notes: list[str],
) -> None:
    generators = workbook_rows(model, "generators")
    if not generators:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Workbook has no generators.")

    # Load time-series override sheets
    ts_p_max_pu = parse_ts_sheet(model, "generators-p_max_pu", snapshots)
    ts_p_min_pu = parse_ts_sheet(model, "generators-p_min_pu", snapshots)

    for row in generators:
        name = text(row.get("name"))
        bus = text(row.get("bus"))
        carrier = text(row.get("carrier"), "LNG")
        if not name or bus not in network.buses.index:
            continue
        p_nom = number(row.get("p_nom"), 0.0)
        if carrier in {"Solar", "Wind", "Hydro"}:
            p_nom *= renewable_multiplier
        marginal_cost = (
            number(row.get("marginal_cost"), 0.0)
            + carbon_price * _carrier_emissions(network, carrier)
        )
        p_max_pu_static = number(row.get("p_max_pu"), 1.0)
        network.add(
            "Generator",
            name,
            bus=bus,
            carrier=carrier,
            control=text(row.get("control"), "PQ"),
            p_nom=p_nom,
            p_nom_min=0.0,
            p_min_pu=0.0,
            p_max_pu=p_max_pu_static,
            marginal_cost=marginal_cost,
            capital_cost=number(row.get("capital_cost"), 0.0),
            committable=False,
        )
        applied = apply_scaled_static_attributes(network.generators, name, row, period_factor)
        if applied:
            notes.append(f"Scaled {', '.join(applied)} for generator {name} by period factor {period_factor:.2f}.")

        # Assign time-series p_max_pu from workbook sheet if present; else no override (static used)
        if ts_p_max_pu and name in ts_p_max_pu:
            network.generators_t.p_max_pu.loc[:, name] = ts_p_max_pu[name]
        # Assign time-series p_min_pu if present
        if ts_p_min_pu and name in ts_p_min_pu:
            network.generators_t.p_min_pu.loc[:, name] = ts_p_min_pu[name]


def add_grid_imports_and_shedding(
    network: pypsa.Network,
    load_totals: dict[str, float],
    carbon_price: float,
    storage_expansion: float,
    notes: list[str],
) -> str:
    """Add grid import generator and per-bus load shedding; return peak bus name."""
    if load_totals:
        peak_bus = max(load_totals, key=load_totals.__getitem__)
    else:
        peak_bus = network.buses.index[0]

    cfg = load_system_defaults()
    gi_cfg = cfg["grid_imports"]
    ls_cfg = cfg["load_shedding"]
    bess_cfg = cfg["system_bess"]

    network.add(
        "Generator",
        "grid_imports",
        bus=peak_bus,
        carrier=gi_cfg["carrier"],
        p_nom=max(float(gi_cfg["p_nom_floor"]), sum(load_totals.values())),
        marginal_cost=float(gi_cfg["marginal_cost_base"])
        + carbon_price * _carrier_emissions(network, gi_cfg["carrier"]),
    )
    network.generators_t.p_max_pu.loc[:, "grid_imports"] = 1.0

    for bus in network.buses.index:
        shed_name = f"load_shedding_{bus}"
        network.add(
            "Generator",
            shed_name,
            bus=bus,
            carrier=ls_cfg["carrier"],
            p_nom=max(float(ls_cfg["p_nom_floor"]), load_totals.get(bus, 300.0)),
            marginal_cost=float(ls_cfg["marginal_cost"]),
        )
        network.generators_t.p_max_pu.loc[:, shed_name] = 1.0

    if storage_expansion > 0:
        bess_carrier = bess_cfg["carrier"]
        if bess_carrier not in network.carriers.index:
            network.add("Carrier", bess_carrier, co2_emissions=0.0)
        network.add(
            "StorageUnit",
            "system_bess",
            bus=peak_bus,
            carrier=bess_carrier,
            p_nom=storage_expansion,
            max_hours=float(bess_cfg["max_hours"]),
            efficiency_store=float(bess_cfg["efficiency_store"]),
            efficiency_dispatch=float(bess_cfg["efficiency_dispatch"]),
            cyclic_state_of_charge=bool(bess_cfg["cyclic_state_of_charge"]),
            marginal_cost=float(bess_cfg["marginal_cost"]),
        )
        notes.append(f"Added {storage_expansion:.0f} MW system BESS at {peak_bus}.")

    return peak_bus
