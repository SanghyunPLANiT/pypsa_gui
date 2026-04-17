"""Capacity expansion result extraction helpers.

Called after network.optimize() has solved.  Returns the `expansionResults`
payload that the frontend uses to render the Capacity Expansion section.
"""
from __future__ import annotations

from typing import Any

import pypsa


def build_expansion_results(network: pypsa.Network) -> list[dict[str, Any]]:
    """Return a list of expansion result dicts for all extendable assets.

    Each dict contains:
        name          – component name
        component     – 'Generator' | 'StorageUnit'
        carrier       – carrier string
        bus           – bus name
        p_nom_mw      – installed / fixed capacity (workbook value)
        p_nom_opt_mw  – optimised capacity from PyPSA
        delta_mw      – p_nom_opt − p_nom  (positive = new build)
        capital_cost  – annualised capital cost ($/MW/yr from network)
        capex_annual  – capital_cost × p_nom_opt  (total annual CAPEX, $)
    """
    results: list[dict[str, Any]] = []

    # ── Generators ────────────────────────────────────────────────────────────
    ext_gen = network.generators[network.generators.p_nom_extendable]
    for name in ext_gen.index:
        p_nom = float(ext_gen.at[name, "p_nom"])
        p_nom_opt = float(ext_gen.at[name, "p_nom_opt"])
        capital_cost = float(ext_gen.at[name, "capital_cost"])
        results.append(
            {
                "name": name,
                "component": "Generator",
                "carrier": str(ext_gen.at[name, "carrier"]),
                "bus": str(ext_gen.at[name, "bus"]),
                "p_nom_mw": round(p_nom, 1),
                "p_nom_opt_mw": round(p_nom_opt, 1),
                "delta_mw": round(p_nom_opt - p_nom, 1),
                "capital_cost": round(capital_cost, 2),
                "capex_annual": round(capital_cost * p_nom_opt),
            }
        )

    # ── Storage units ─────────────────────────────────────────────────────────
    if not network.storage_units.empty:
        ext_su = network.storage_units[network.storage_units.p_nom_extendable]
        for name in ext_su.index:
            p_nom = float(ext_su.at[name, "p_nom"])
            p_nom_opt = float(ext_su.at[name, "p_nom_opt"])
            capital_cost = float(ext_su.at[name, "capital_cost"])
            results.append(
                {
                    "name": name,
                    "component": "StorageUnit",
                    "carrier": str(ext_su.at[name, "carrier"]),
                    "bus": str(ext_su.at[name, "bus"]),
                    "p_nom_mw": round(p_nom, 1),
                    "p_nom_opt_mw": round(p_nom_opt, 1),
                    "delta_mw": round(p_nom_opt - p_nom, 1),
                    "capital_cost": round(capital_cost, 2),
                    "capex_annual": round(capital_cost * p_nom_opt),
                }
            )

    return results
