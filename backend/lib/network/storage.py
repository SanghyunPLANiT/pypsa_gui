from __future__ import annotations

from typing import Any

import pypsa

from ..utils.coerce import bool_value, number, text
from ..utils.workbook import apply_scaled_static_attributes, workbook_rows


def add_stores(
    network: pypsa.Network,
    model: dict[str, list[dict[str, Any]]],
    period_factor: float,
    notes: list[str],
) -> None:
    for row in workbook_rows(model, "stores"):
        name = text(row.get("name"))
        bus = text(row.get("bus"))
        if not name or bus not in network.buses.index:
            continue
        carrier = text(row.get("carrier"), "Store")
        if carrier not in network.carriers.index:
            network.add("Carrier", carrier, co2_emissions=0.0)
        network.add(
            "Store",
            name,
            bus=bus,
            carrier=carrier,
            e_nom=number(row.get("e_nom"), 0.0),
            e_initial=number(row.get("e_initial"), 0.0),
            e_min_pu=number(row.get("e_min_pu"), 0.0),
            e_max_pu=number(row.get("e_max_pu"), 1.0),
            standing_loss=number(row.get("standing_loss"), 0.0),
            marginal_cost=number(row.get("marginal_cost"), 0.0),
        )
        applied = apply_scaled_static_attributes(network.stores, name, row, period_factor)
        if applied:
            notes.append(f"Scaled {', '.join(applied)} for store {name} by period factor {period_factor:.2f}.")


def add_storage_units(
    network: pypsa.Network,
    model: dict[str, list[dict[str, Any]]],
    period_factor: float,
    notes: list[str],
) -> None:
    for row in workbook_rows(model, "storage_units"):
        name = text(row.get("name"))
        bus = text(row.get("bus"))
        if not name or bus not in network.buses.index:
            continue
        carrier = text(row.get("carrier"), "Storage")
        if carrier not in network.carriers.index:
            network.add("Carrier", carrier, co2_emissions=0.0)
        network.add(
            "StorageUnit",
            name,
            bus=bus,
            carrier=carrier,
            p_nom=number(row.get("p_nom"), 0.0),
            max_hours=number(row.get("max_hours"), 1.0),
            efficiency_store=number(row.get("efficiency_store"), 1.0),
            efficiency_dispatch=number(row.get("efficiency_dispatch"), 1.0),
            state_of_charge_initial=number(row.get("state_of_charge_initial"), 0.0),
            cyclic_state_of_charge=bool_value(row.get("cyclic_state_of_charge"), True),
            marginal_cost=number(row.get("marginal_cost"), 0.0),
        )
        applied = apply_scaled_static_attributes(network.storage_units, name, row, period_factor)
        if applied:
            notes.append(f"Scaled {', '.join(applied)} for storage unit {name} by period factor {period_factor:.2f}.")
