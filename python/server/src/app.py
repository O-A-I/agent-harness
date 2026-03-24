"""FastAPI router for task routing — POST /route."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from router.src.analyzer import analyze_repo
from router.src.models import AgentCapability, RepoProfile, RoutingDecision, Task
from router.src.scorer import route_task

app = FastAPI(
    title="Agent Harness Backend",
    version="0.1.0",
    description="Python backend — task routing, verification, and TS bridge",
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

    return route_task(request.task, profile, request.agents)


@app.post("/analyze", response_model=RepoProfile)
async def analyze(repo_path: str) -> RepoProfile:
    """Analyze a repository and return its profile."""
    try:
        return analyze_repo(repo_path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
