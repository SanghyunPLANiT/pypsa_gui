from __future__ import annotations

from typing import Any

import pypsa

from ..utils.coerce import number, text
from ..utils.workbook import workbook_rows


def add_global_constraints(
    network: pypsa.Network,
    model: dict[str, list[dict[str, Any]]],
    period_factor: float,
) -> None:
    for row in workbook_rows(model, "global_constraints"):
        name = text(row.get("name"))
        constraint_type = text(row.get("type"))
        if not name or not constraint_type:
            continue
        kwargs: dict[str, Any] = {
            "type": constraint_type,
            "sense": text(row.get("sense"), "<="),
            "constant": number(row.get("constant"), 0.0)
            * (period_factor if constraint_type in {"primary_energy", "operational_limit"} else 1.0),
        }
        carrier_attribute = text(row.get("carrier_attribute"))
        if carrier_attribute:
            kwargs["carrier_attribute"] = carrier_attribute
        investment_period = row.get("investment_period")
        if investment_period not in (None, ""):
            kwargs["investment_period"] = investment_period
        network.add("GlobalConstraint", name, **kwargs)
