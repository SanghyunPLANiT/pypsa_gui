from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .lib.config import load_system_defaults
from .lib.models import RunPayload
from .lib.network import validate_model
from .lib.results import run_pypsa

app = FastAPI(title="PyPSA Studio Backend", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/config")
def get_config() -> dict[str, Any]:
    cfg = load_system_defaults()
    sim = cfg.get("simulation", {})
    return {
        "maxSnapshots": int(sim.get("max_snapshots", 8760)),
        "defaultSnapshotCount": int(sim.get("default_snapshot_count", 24)),
        "defaultSnapshotWeight": float(sim.get("default_snapshot_weight", 1.0)),
    }


@app.post("/api/validate")
def validate_case(payload: RunPayload) -> dict[str, Any]:
    return validate_model(payload)


@app.post("/api/run")
def run_case(payload: RunPayload) -> dict[str, Any]:
    return run_pypsa(payload)
