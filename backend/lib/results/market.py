"""Market analysis helpers — merit order and CO₂ shadow price.

Both are pure post-processing on the solved network; no extra LP solve needed.
"""
from __future__ import annotations

from typing import Any

import pypsa

from ..constants import CARRIER_COLORS


# ── Merit order ───────────────────────────────────────────────────────────────

def build_merit_order(network: pypsa.Network) -> list[dict[str, Any]]:
    """Return the supply-stack (merit order) sorted by marginal cost.

    System generators (grid_imports, load_shedding_*) are excluded — they
    exist as reliability backstops and distort the supply curve.

    Each dict:
        name          – generator name
        carrier       – carrier string
        bus           – bus name
        marginal_cost – $/MWh
        p_nom         – installed capacity (MW); uses p_nom_opt for extendable
        cumulative_mw – left edge of this generator's block on the x-axis
        color         – hex colour for the carrier
    """
    SYSTEM_GEN_PREFIXES = ("grid_imports", "load_shedding_", "system_bess")

    rows: list[dict[str, Any]] = []
    for name in network.generators.index:
        if any(name.startswith(pfx) for pfx in SYSTEM_GEN_PREFIXES):
            continue
        gen = network.generators.loc[name]
        # Use optimised capacity for extendable assets, installed otherwise
        extendable = bool(gen.get("p_nom_extendable", False))
        p_nom = float(gen.get("p_nom_opt", 0.0) if extendable else gen.get("p_nom", 0.0))
        if p_nom <= 0:
            continue
        carrier = str(gen.get("carrier", ""))
        rows.append(
            {
                "name": name,
                "carrier": carrier,
                "bus": str(gen.get("bus", "")),
                "marginal_cost": round(float(gen.get("marginal_cost", 0.0)), 2),
                "p_nom": round(p_nom, 1),
                "color": CARRIER_COLORS.get(carrier, "#94a3b8"),
            }
        )

    # Sort by marginal cost ascending (merit order)
    rows.sort(key=lambda r: (r["marginal_cost"], r["name"]))

    # Add cumulative MW (x-axis position)
    cumulative = 0.0
    for row in rows:
        row["cumulative_mw"] = round(cumulative, 1)
        cumulative += row["p_nom"]

    return rows


# ── CO₂ shadow price ─────────────────────────────────────────────────────────

def build_co2_shadow(network: pypsa.Network, carbon_price: float) -> dict[str, Any]:
    """Return CO₂ shadow price information from the solved network.

    The shadow price (mu) is the dual variable of the CO₂ global constraint.
    It represents the marginal cost of tightening the cap by 1 tonne —
    i.e. what the implied carbon price is that makes the constraint binding.

    Returns a dict:
        found           – bool, whether a CO₂ constraint exists and is bound
        constraint_name – name of the CO₂ global constraint (if found)
        shadow_price    – $/tCO₂  (dual variable value, positive = binding)
        explicit_price  – carbon price set in scenario ($/tCO₂)
        cap_ktco2       – the constraint rhs in ktCO₂e (if applicable)
        status          – 'binding' | 'slack' | 'none'
        note            – human-readable explanation
    """
    result: dict[str, Any] = {
        "found": False,
        "constraint_name": None,
        "shadow_price": 0.0,
        "explicit_price": round(float(carbon_price), 2),
        "cap_ktco2": None,
        "status": "none",
        "note": "No CO₂ global constraint defined in this model.",
    }

    if network.global_constraints.empty:
        return result

    # Find constraints related to CO₂ (primary_energy type with co2_emissions attribute)
    co2_constraints = network.global_constraints[
        (network.global_constraints.get("carrier_attribute", "") == "co2_emissions")
        | (network.global_constraints.index.str.contains("co2", case=False))
    ]

    if co2_constraints.empty:
        return result

    # Use the first CO₂ constraint found
    name = co2_constraints.index[0]
    result["found"] = True
    result["constraint_name"] = name

    constant = float(co2_constraints.at[name, "constant"]) if "constant" in co2_constraints.columns else None
    if constant is not None:
        result["cap_ktco2"] = round(constant / 1000.0, 1)  # tonnes → ktCO₂e

    # Extract shadow price (dual variable / mu)
    mu = 0.0
    if hasattr(network, "global_constraints") and "mu" in network.global_constraints.columns:
        raw_mu = network.global_constraints.at[name, "mu"]
        if raw_mu is not None:
            try:
                mu = float(raw_mu)
            except (TypeError, ValueError):
                mu = 0.0

    result["shadow_price"] = round(abs(mu), 2)

    # Determine status
    BINDING_THRESHOLD = 0.01  # $/tCO₂ — below this treat as non-binding
    if abs(mu) > BINDING_THRESHOLD:
        result["status"] = "binding"
        result["note"] = (
            f"CO₂ constraint '{name}' is binding. "
            f"Shadow price = ${abs(mu):.2f}/tCO₂ — the system would save "
            f"${abs(mu):.2f} per tonne of additional emission headroom."
        )
    else:
        result["status"] = "slack"
        result["note"] = (
            f"CO₂ constraint '{name}' exists but is not binding — "
            f"actual emissions are below the cap. Shadow price ≈ $0."
        )

    return result
