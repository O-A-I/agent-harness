"""FastAPI application — TS↔Python bridge for Agent Harness."""

from __future__ import annotations

from fastapi import FastAPI

app = FastAPI(
    title="Agent Harness Backend",
    version="0.1.0",
    description="Python backend bridging routing, verification, and the TypeScript extension",
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
