from __future__ import annotations

from typing import Any

import pandas as pd
import pypsa

from ..config import load_system_defaults
from ..models import RunPayload
from ..profiles import modeled_period_factor, snapshot_settings, workbook_snapshot_index
from ..utils.coerce import number, text
from ..utils.workbook import workbook_rows
from .buses import add_buses, add_loads
from .constraints import add_global_constraints
from .generators import add_generators, add_grid_imports_and_shedding
from .lines import add_links, add_lines, add_shunt_impedances, add_transformers
from .storage import add_storage_units, add_stores
from .validators import validate_model


def build_network(payload: RunPayload) -> tuple[pypsa.Network, list[str]]:
    model = payload.model
    scenario = payload.scenario
    notes: list[str] = []

    # Determine snapshot index: use workbook timestamps if available, else synthetic
    snapshot_rows = workbook_rows(model, "snapshots")
    wb_index = workbook_snapshot_index(snapshot_rows)

    if wb_index is not None:
        snapshots = wb_index
        # Honour per-row weighting if uniform; fall back to 1.0
        snapshot_weight = number(snapshot_rows[0].get("objective"), 1.0) if snapshot_rows else 1.0
        snapshot_count = len(snapshots)
        notes.append(
            f"Using {snapshot_count} workbook snapshots "
            f"({snapshots[0]} → {snapshots[-1]})."
        )
    else:
        snapshot_count, snapshot_weight, snapshot_start = snapshot_settings(payload)
        start_date = load_system_defaults().get("simulation", {}).get("start_date", "2024-01-01")
        start_ts = pd.Timestamp(start_date) + pd.Timedelta(hours=snapshot_start)
        snapshots = pd.date_range(start_ts, periods=snapshot_count, freq="h")
        notes.append(
            f"Static model: {snapshot_count} synthetic hourly snapshots "
            f"starting {start_ts} at {snapshot_weight:g} h/snapshot."
        )

    period_factor = modeled_period_factor(snapshot_count, snapshot_weight)

    network = pypsa.Network()
    network.set_snapshots(snapshots)
    network.snapshot_weightings.loc[:, "objective"] = snapshot_weight
    network.snapshot_weightings.loc[:, "stores"] = snapshot_weight
    network.snapshot_weightings.loc[:, "generators"] = snapshot_weight
    network.name = text(
        workbook_rows(model, "network")[0].get("name")
        if workbook_rows(model, "network")
        else "PyPSA Studio Case"
    )

    # Carriers
    system_carriers = {"Imports", "LoadShedding"}
    for row in workbook_rows(model, "carriers"):
        carrier_name = text(row.get("name"))
        if carrier_name and carrier_name not in network.carriers.index:
            network.add("Carrier", carrier_name, co2_emissions=number(row.get("co2_emissions"), 0.0))
        system_carriers.discard(carrier_name)
    for carrier_name in system_carriers:
        network.add("Carrier", carrier_name, co2_emissions=0.0)

    # Topology
    add_buses(network, model)
    load_totals = add_loads(network, model, snapshots, number(scenario.get("demandGrowth"), 0.0))
    add_stores(network, model, period_factor, notes)
    add_storage_units(network, model, period_factor, notes)
    add_shunt_impedances(network, model)

    # Generation
    renewable_multiplier = 1.0 + number(scenario.get("renewableTarget"), 0.0) / 1000.0
    carbon_price = number(scenario.get("carbonPrice"), 0.0)
    add_generators(network, model, snapshots, period_factor, renewable_multiplier, carbon_price, notes)
    add_grid_imports_and_shedding(
        network, load_totals, carbon_price, number(scenario.get("storageExpansion"), 0.0), notes
    )

    # Transmission
    transmission_multiplier = 1.0 + number(scenario.get("transmissionExpansion"), 0.0) / 100.0
    add_lines(network, model, transmission_multiplier)
    add_links(network, model)
    add_transformers(network, model, transmission_multiplier)

    # Constraints
    add_global_constraints(network, model, period_factor)

    notes.append(
        f"Prepared PyPSA case with {len(network.buses)} buses, "
        f"{len(network.generators)} generators, {len(network.loads)} loads."
    )
    return network, notes
