"""Tests for the dashboard API endpoints."""

from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient

from server.src.app import app
from server.src.dashboard_api import set_db
from server.src.persistence import HarnessDB


@pytest.fixture
def db() -> HarnessDB:
    _db = HarnessDB(":memory:")
    set_db(_db)
    return _db


@pytest.fixture
async def client(db: HarnessDB) -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_health(client: AsyncClient) -> None:
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_list_workflows_empty(client: AsyncClient) -> None:
    resp = await client.get("/api/workflows")
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 0
    assert data["workflows"] == []


@pytest.mark.asyncio
async def test_list_workflows(client: AsyncClient, db: HarnessDB) -> None:
    db.save_workflow("wf-1", "t1", phase="Done")
    db.save_workflow("wf-2", "t2", phase="Failed")

    resp = await client.get("/api/workflows")
    data = resp.json()
    assert data["count"] == 2


@pytest.mark.asyncio
async def test_list_workflows_filter(client: AsyncClient, db: HarnessDB) -> None:
    db.save_workflow("wf-1", "t1", phase="Done")
    db.save_workflow("wf-2", "t2", phase="Failed")

    resp = await client.get("/api/workflows?phase=Done")
    data = resp.json()
    assert data["count"] == 1
    assert data["workflows"][0]["phase"] == "Done"


@pytest.mark.asyncio
async def test_get_workflow(client: AsyncClient, db: HarnessDB) -> None:
    db.save_workflow("wf-1", "t1", phase="Done", agent_id="a1")
    db.save_transition("wf-1", "Created", "Done")

    resp = await client.get("/api/workflows/wf-1")
    data = resp.json()
    assert data["id"] == "wf-1"
    assert data["agent_id"] == "a1"
    assert len(data["transitions"]) == 1


@pytest.mark.asyncio
async def test_get_workflow_not_found(client: AsyncClient) -> None:
    resp = await client.get("/api/workflows/nonexistent")
    data = resp.json()
    assert "error" in data


@pytest.mark.asyncio
async def test_agent_stats(client: AsyncClient, db: HarnessDB) -> None:
    db.save_workflow("wf-1", "t1", phase="Done", agent_id="a1")
    db.save_workflow("wf-2", "t2", phase="Done", agent_id="a1")

    resp = await client.get("/api/stats/agents")
    data = resp.json()
    assert len(data["agents"]) == 1
    assert data["agents"][0]["total"] == 2


@pytest.mark.asyncio
async def test_verification_stats(client: AsyncClient) -> None:
    resp = await client.get("/api/stats/verification")
    data = resp.json()
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_progress(client: AsyncClient, db: HarnessDB) -> None:
    db.update_daily_progress(date="2026-03-25", started=5, completed=3)

    resp = await client.get("/api/progress?date=2026-03-25")
    data = resp.json()
    assert data["progress"]["workflows_started"] == 5


@pytest.mark.asyncio
async def test_progress_no_data(client: AsyncClient) -> None:
    resp = await client.get("/api/progress?date=2020-01-01")
    data = resp.json()
    assert data["progress"] is None


@pytest.mark.asyncio
async def test_export_import_roundtrip(client: AsyncClient, db: HarnessDB) -> None:
    db.save_workflow("wf-exp", "t-exp", phase="Done")

    # Export
    resp = await client.post("/api/export")
    assert resp.status_code == 200
    exported = resp.json()
    assert len(exported["workflows"]) == 1

    # Clear and reimport
    db2 = HarnessDB(":memory:")
    set_db(db2)

    resp = await client.post("/api/import", json={"data": exported})
    assert resp.status_code == 200
    assert resp.json()["imported"] >= 1

    # Verify imported
    wf = db2.get_workflow("wf-exp")
    assert wf is not None
