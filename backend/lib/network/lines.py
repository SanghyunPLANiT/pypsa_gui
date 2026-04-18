from __future__ import annotations

from typing import Any

import pypsa

from ..utils.coerce import number, text
from ..utils.workbook import workbook_rows


def add_lines(
    network: pypsa.Network,
    model: dict[str, list[dict[str, Any]]],
) -> None:
    for row in workbook_rows(model, "lines"):
        name = text(row.get("name"))
        bus0 = text(row.get("bus0"))
        bus1 = text(row.get("bus1"))
        if not name or bus0 not in network.buses.index or bus1 not in network.buses.index:
            continue
        network.add(
            "Line",
            name,
            bus0=bus0,
            bus1=bus1,
            x=number(row.get("x"), 0.1),
            r=number(row.get("r"), 0.01),
            b=number(row.get("b"), 0.0),
            s_nom=number(row.get("s_nom"), 100.0),
            length=number(row.get("length"), 1.0),
            num_parallel=max(1, int(number(row.get("num_parallel"), 1.0))),
            s_max_pu=number(row.get("s_max_pu"), 1.0),
        )


def add_links(
    network: pypsa.Network,
    model: dict[str, list[dict[str, Any]]],
) -> None:
    for row in workbook_rows(model, "links"):
        name = text(row.get("name"))
        bus0 = text(row.get("bus0"))
        bus1 = text(row.get("bus1"))
        if not name or bus0 not in network.buses.index or bus1 not in network.buses.index:
            continue
        carrier = text(row.get("carrier"), "Link")
        if carrier not in network.carriers.index:
            network.add("Carrier", carrier, co2_emissions=0.0)

        kwargs: dict[str, Any] = dict(
            bus0=bus0,
            bus1=bus1,
            carrier=carrier,
            p_nom=number(row.get("p_nom"), 0.0),
            p_min_pu=number(row.get("p_min_pu"), -1.0),
            p_max_pu=number(row.get("p_max_pu"), 1.0),
            efficiency=number(row.get("efficiency"), 1.0),
            marginal_cost=number(row.get("marginal_cost"), 0.0),
            capital_cost=number(row.get("capital_cost"), 0.0),
        )

        # Multi-output ports (sector coupling: CHP, co-generation, etc.)
        for suffix in ("2", "3"):
            b = text(row.get(f"bus{suffix}"))
            if b and b in network.buses.index:
                kwargs[f"bus{suffix}"] = b
                kwargs[f"efficiency{suffix}"] = number(row.get(f"efficiency{suffix}"), 1.0)

        # Optional capacity optimisation
        if bool(row.get("p_nom_extendable", False)):
            kwargs["p_nom_extendable"] = True
            p_nom_max = row.get("p_nom_max")
            if p_nom_max not in (None, "", "inf"):
                kwargs["p_nom_max"] = number(p_nom_max, float("inf"))

        network.add("Link", name, **kwargs)


def add_transformers(
    network: pypsa.Network,
    model: dict[str, list[dict[str, Any]]],
) -> None:
    for row in workbook_rows(model, "transformers"):
        name = text(row.get("name"))
        bus0 = text(row.get("bus0"))
        bus1 = text(row.get("bus1"))
        if not name or bus0 not in network.buses.index or bus1 not in network.buses.index:
            continue
        network.add(
            "Transformer",
            name,
            bus0=bus0,
            bus1=bus1,
            x=number(row.get("x"), 0.02),
            r=number(row.get("r"), 0.002),
            g=number(row.get("g"), 0.0),
            b=number(row.get("b"), 0.05),
            s_nom=number(row.get("s_nom"), 100.0),
            tap_ratio=number(row.get("tap_ratio"), 1.0),
            tap_side=int(number(row.get("tap_side"), 0.0)),
            phase_shift=number(row.get("phase_shift"), 0.0),
            model=text(row.get("model"), "t"),
        )


def add_shunt_impedances(
    network: pypsa.Network,
    model: dict[str, list[dict[str, Any]]],
) -> None:
    for row in workbook_rows(model, "shunt_impedances"):
        name = text(row.get("name"))
        bus = text(row.get("bus"))
        if not name or bus not in network.buses.index:
            continue
        network.add(
            "ShuntImpedance",
            name,
            bus=bus,
            g=number(row.get("g"), 0.0),
            b=number(row.get("b"), 0.0),
            sign=number(row.get("sign"), 1.0),
        )
