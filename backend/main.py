from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .lib.models import RunPayload
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


@app.post("/api/run")
def run_case(payload: RunPayload) -> dict[str, Any]:
    return run_pypsa(payload)
