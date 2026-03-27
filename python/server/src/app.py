"""FastAPI application — task routing, verification, and dashboard API."""

from __future__ import annotations

import logging
import os
import traceback
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from router.src.analyzer import analyze_repo
from router.src.models import AgentCapability, RepoProfile, RoutingDecision, Task
from router.src.scorer import route_task
from server.src.dashboard_api import router as dashboard_router
from server.src.dashboard_api import set_db, ws_router
from server.src.persistence import HarnessDB

logger = logging.getLogger("agent-harness")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    db_path = os.environ.get(
        "HARNESS_DB_PATH", str(Path.home() / ".harness" / "harness.db")
    )
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    db = HarnessDB(db_path)
    set_db(db)
    yield
    db.close()


app = FastAPI(
    title="Agent Harness Backend",
    version="0.1.0",
    description="Python backend — task routing, verification, dashboard API",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard_router)
app.include_router(ws_router)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch unhandled exceptions and return a structured JSON error."""
    logger.error("Unhandled error on %s %s: %s", request.method, request.url.path, exc)
    logger.debug(traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {type(exc).__name__}: {exc}"},
    )


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


class RouteRequest(BaseModel):
    task: Task
    agents: list[AgentCapability]
    repo_path: str | None = None
    repo_profile: RepoProfile | None = None


@app.post("/route", response_model=RoutingDecision)
async def route(request: RouteRequest) -> RoutingDecision:
    """Route a task to the best-fit agent."""
    if not request.agents:
        raise HTTPException(status_code=400, detail="No agents provided")

    # Get or build repo profile
    if request.repo_profile:
        profile = request.repo_profile
    elif request.repo_path:
        try:
            profile = analyze_repo(request.repo_path)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    else:
        raise HTTPException(
            status_code=400,
            detail="Either repo_path or repo_profile must be provided",
        )

    try:
        return route_task(request.task, profile, request.agents)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/analyze", response_model=RepoProfile)
async def analyze(repo_path: str) -> RepoProfile:
    """Analyze a repository and return its profile."""
    try:
        return analyze_repo(repo_path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
