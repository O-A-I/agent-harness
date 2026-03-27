"""Dashboard API — REST + WebSocket endpoints for the standalone dashboard.

Provides:
- GET /api/workflows — list workflows with optional phase filter
- GET /api/workflows/{id} — get single workflow with transitions
- GET /api/stats/agents — agent performance stats
- GET /api/stats/verification — verification pass rates
- GET /api/progress — daily progress (supports date range)
- POST /api/export — export all data as JSON
- POST /api/import — import data from JSON
- WebSocket /ws/live — live workflow updates
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from .persistence import HarnessDB

router = APIRouter(prefix="/api")

# Shared DB instance — set by app startup
_db: HarnessDB | None = None
_live_connections: list[WebSocket] = []


def set_db(db: HarnessDB) -> None:
    global _db
    _db = db


def get_db() -> HarnessDB:
    if _db is None:
        raise RuntimeError("Database not initialized — call set_db() first")
    return _db


# ── REST Endpoints ──


@router.get("/workflows")
async def list_workflows(
    phase: str | None = Query(None, description="Filter by workflow phase"),
    limit: int = Query(100, ge=1, le=1000),
) -> dict[str, Any]:
    db = get_db()
    workflows = db.list_workflows(phase=phase, limit=limit)
    # Attach transitions for each workflow
    for wf in workflows:
        wf["transitions"] = db.get_transitions(wf["id"])
    return {"workflows": workflows, "count": len(workflows)}


@router.get("/workflows/{workflow_id}")
async def get_workflow(workflow_id: str) -> dict[str, Any]:
    db = get_db()
    wf = db.get_workflow(workflow_id)
    if wf is None:
        return {"error": f"Workflow '{workflow_id}' not found"}
    wf["transitions"] = db.get_transitions(workflow_id)
    wf["routing_decisions"] = db.get_routing_decisions(workflow_id)
    wf["verification_results"] = db.get_verification_results(workflow_id)
    return wf


@router.get("/stats/agents")
async def agent_stats() -> dict[str, Any]:
    db = get_db()
    stats = db.get_agent_stats()
    return {"agents": stats}


@router.get("/stats/verification")
async def verification_stats() -> dict[str, Any]:
    db = get_db()
    return db.get_verification_stats()


@router.get("/progress")
async def progress(
    date: str | None = Query(None, description="Single date (YYYY-MM-DD)"),
    start_date: str | None = Query(None, description="Range start"),
    end_date: str | None = Query(None, description="Range end"),
) -> dict[str, Any]:
    db = get_db()
    if start_date and end_date:
        data = db.get_progress_range(start_date, end_date)
        return {"progress": data}
    single = db.get_daily_progress(date)
    if single is None:
        return {"progress": None, "message": f"No data for {date or 'today'}"}
    return {"progress": single}


class ImportData(BaseModel):
    data: dict[str, Any]


@router.post("/export")
async def export_data() -> dict[str, Any]:
    db = get_db()
    return db.export_json()


@router.post("/import")
async def import_data(body: ImportData) -> dict[str, Any]:
    db = get_db()
    count = db.import_json(body.data)
    return {"imported": count}


# ── WebSocket for Live Updates ──


async def broadcast(event: dict[str, Any]) -> None:
    """Broadcast an event to all connected WebSocket clients."""
    dead: list[WebSocket] = []
    message = json.dumps(event)
    for ws in _live_connections:
        try:
            await ws.send_text(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _live_connections.remove(ws)


ws_router = APIRouter()


@ws_router.websocket("/ws/live")
async def websocket_live(websocket: WebSocket) -> None:
    """WebSocket endpoint for live workflow updates."""
    await websocket.accept()
    _live_connections.append(websocket)
    try:
        while True:
            # Keep connection alive, listen for ping/pong
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        if websocket in _live_connections:
            _live_connections.remove(websocket)
