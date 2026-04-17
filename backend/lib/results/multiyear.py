"""
Multi-year investment planning run orchestrator.

Wires together:
  build_multiperiod_network()  →  network.optimize()  →  build_multiyear_results()
"""
from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from ..models import RunPayload
from ..network.multiperiod import build_multiperiod_network
from .multiperiod_results import build_multiyear_results


def run_multiyear(payload: RunPayload) -> dict[str, Any]:
    """Full multi-year investment planning run.

    Returns a dict matching the frontend MultiYearResults interface:
        type            : 'multiyear'
        periods         : list[MultiYearPeriodResult]
        totalNpvM       : float
        narrative       : list[str]
        runMeta         : { investmentPeriods, snapshotCount, snapshotWeight }
    """
    options = payload.options or {}
    scenario = payload.scenario or {}

    investment_periods: list[int] = options.get("investmentPeriods", [])
    if not investment_periods or len(investment_periods) < 2:
        raise HTTPException(
            status_code=400,
            detail="investmentPeriods must contain at least 2 years.",
        )

    period_length = int(options.get("periodLength", 5))
    discount_rate = float(scenario.get("discountRate", 0.05))

    # Build multi-period network
    try:
        network, notes = build_multiperiod_network(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Multi-period network build failed: {exc}"
        ) from exc

    # Optimise
    try:
        network.optimize(
            solver_name="highs",
            multi_investment_periods=True,
        )
        notes.append("Multi-period optimisation solved with HiGHS.")
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Multi-period optimisation failed: {exc}",
        ) from exc

    # Extract results
    result = build_multiyear_results(network, investment_periods, period_length, discount_rate)

    return {
        "type": "multiyear",
        "periods": result["periods"],
        "totalNpvM": result["totalNpvM"],
        "narrative": notes + result["narrative"],
        "runMeta": result["runMeta"],
    }
