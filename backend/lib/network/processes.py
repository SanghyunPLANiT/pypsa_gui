from __future__ import annotations

from typing import Any

import pypsa

from ..utils.coerce import number, text
from ..utils.workbook import workbook_rows


def add_processes(
    network: pypsa.Network,
    model: dict[str, list[dict[str, Any]]],
) -> None:
    """Add PyPSA Process components from the workbook 'processes' sheet.

    PyPSA Process uses rate0/rate1 (not efficiency) as the conversion
    coefficients:
      - rate0 = -1.0  →  bus0 is an input (withdrawal, e.g. fuel)
      - rate1 = η     →  bus1 is an output equal to η × |input|

    The user-facing column is 'efficiency' (more familiar); the backend
    maps it to rate1 automatically. Optional bus2/bus3 ports follow the
    same pattern (efficiency2 → rate2, etc.).
    """
    for row in workbook_rows(model, "processes"):
        name = text(row.get("name"))
        bus0 = text(row.get("bus0"))
        bus1 = text(row.get("bus1"))
        if not name or bus0 not in network.buses.index or bus1 not in network.buses.index:
            continue

        carrier = text(row.get("carrier"), "")
        if carrier and carrier not in network.carriers.index:
            network.add("Carrier", carrier, co2_emissions=0.0)

        efficiency = number(row.get("efficiency"), 1.0)

        kwargs: dict[str, Any] = dict(
            bus0=bus0,
            bus1=bus1,
            # rate0 = -1 means bus0 is the input (withdrawal)
            # rate1 = efficiency means output = efficiency × input
            rate0=-1.0,
            rate1=efficiency,
            p_nom=number(row.get("p_nom"), 0.0),
            p_min_pu=number(row.get("p_min_pu"), 0.0),
            p_max_pu=number(row.get("p_max_pu"), 1.0),
            marginal_cost=number(row.get("marginal_cost"), 0.0),
            capital_cost=number(row.get("capital_cost"), 0.0),
        )
        if carrier:
            kwargs["carrier"] = carrier

        # Optional extendable capacity
        if bool(row.get("p_nom_extendable", False)):
            kwargs["p_nom_extendable"] = True
            p_nom_max = row.get("p_nom_max")
            if p_nom_max not in (None, "", "inf"):
                kwargs["p_nom_max"] = number(p_nom_max, float("inf"))

        # Optional multi-output ports (e.g. CHP: bus2 = heat output)
        for suffix in ("2", "3"):
            b = text(row.get(f"bus{suffix}"))
            if b and b in network.buses.index:
                kwargs[f"bus{suffix}"] = b
                eff_n = number(row.get(f"efficiency{suffix}"), 1.0)
                kwargs[f"rate{suffix}"] = eff_n

        network.add("Process", name, **kwargs)
