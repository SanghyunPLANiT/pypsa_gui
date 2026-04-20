from __future__ import annotations

import asyncio
import contextlib
import multiprocessing as mp
import queue
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from .lib.config import load_system_defaults
from .lib.models import RunPayload
from .lib.network import validate_model
from .lib.results import run_pypsa


# ── Subprocess worker ─────────────────────────────────────────────────────────
# Must be a module-level function so multiprocessing "spawn" can import it.

def _solve_worker(
    payload: RunPayload,
    result_queue: "mp.Queue[tuple[str, Any]]",
) -> None:
    """Run in a child process. Puts ("ok", result) or ("err", msg) into the queue."""
    try:
        result = run_pypsa(payload)
        result_queue.put(("ok", result))
    except Exception as exc:  # noqa: BLE001
        result_queue.put(("err", str(exc)))


def _collect_result(
    proc: mp.Process,
    result_queue: "mp.Queue[tuple[str, Any]]",
) -> dict[str, Any]:
    """Block (in a thread) until the worker finishes or is killed."""
    while True:
        try:
            status, data = result_queue.get(timeout=0.5)
            proc.join(timeout=5)
            if status == "err":
                raise HTTPException(
                    status_code=500,
                    detail=f"PyPSA optimization failed: {data}",
                )
            return data  # type: ignore[return-value]
        except queue.Empty:
            if not proc.is_alive():
                # Process was terminated (cancelled) or crashed without putting a result
                raise HTTPException(status_code=499, detail="Optimization was cancelled.")


# ── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(title="Ragnarok Backend", version="0.1.0")
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
async def run_case(request: Request, payload: RunPayload) -> dict[str, Any]:
    """
    Run PyPSA optimisation in a child process so it can be truly killed when
    the user clicks Cancel (which aborts the HTTP request from the frontend).

    Flow:
      1. Spawn a child process running _solve_worker.
      2. An async watcher task polls request.is_disconnected() every 0.5 s;
         when the client disconnects it calls proc.terminate().
      3. _collect_result() polls the queue in a thread; it returns the result
         or raises once the process is no longer alive.
    """
    ctx = mp.get_context("spawn")
    result_queue: mp.Queue = ctx.Queue()
    proc: mp.Process = ctx.Process(
        target=_solve_worker,
        args=(payload, result_queue),
        daemon=True,
    )
    proc.start()

    async def _kill_on_disconnect() -> None:
        while True:
            if await request.is_disconnected():
                if proc.is_alive():
                    proc.terminate()
                    proc.join(timeout=3)
                break
            await asyncio.sleep(0.5)

    disconnect_task = asyncio.create_task(_kill_on_disconnect())
    try:
        return await asyncio.to_thread(_collect_result, proc, result_queue)
    except Exception:
        if proc.is_alive():
            proc.terminate()
            proc.join(timeout=3)
        raise
    finally:
        disconnect_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await disconnect_task
