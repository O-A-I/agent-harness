"""Integration test: FastAPI routing endpoint (TS↔Python bridge simulation).

Tests the full /route and /analyze endpoints as the TypeScript extension would call them.
"""

from collections.abc import AsyncGenerator
from datetime import datetime

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
async def test_route_task_full_roundtrip(client: AsyncClient) -> None:
    """Simulate what the TS PythonBridge.routeTask() does."""
    payload = {
        "task": {
            "id": "task-101",
            "title": "Fix login validation bug",
            "description": "Email validation allows invalid domains",
            "type": "bug-fix",
            "repo": "/test/repo",
            "created_at": datetime.now().isoformat(),
        },
        "agents": [
            {
                "id": "ts-expert",
                "name": "TypeScript Expert",
                "description": "Expert at TS and React",
                "mcp_server": "copilot",
                "tools": ["edit_file", "read_file", "run_test", "git_commit", "search"],
                "languages": ["typescript", "javascript"],
                "frameworks": ["react", "nextjs"],
                "task_types": ["bug-fix", "feature", "refactor"],
            },
            {
                "id": "py-expert",
                "name": "Python Expert",
                "description": "Expert at Python",
                "mcp_server": "copilot",
                "tools": ["edit_file", "read_file", "run_test"],
                "languages": ["python"],
                "frameworks": ["fastapi"],
                "task_types": ["bug-fix", "feature"],
            },
        ],
        "repo_profile": {
            "path": "/test/repo",
            "languages": [
                {"name": "typescript", "percentage": 80.0},
                {"name": "javascript", "percentage": 20.0},
            ],
            "frameworks": ["react", "nextjs"],
            "build_system": "turborepo",
            "test_framework": "vitest",
            "package_manager": "pnpm",
            "analyzed_at": datetime.now().isoformat(),
        },
    }

    resp = await client.post("/route", json=payload)
    assert resp.status_code == 200

    decision = resp.json()
    assert decision["selected_agent_id"] == "ts-expert"
    assert decision["confidence"] > 0.5
    assert len(decision["scores"]) == 2
    assert decision["task_id"] == "task-101"

    # Verify scores are ordered
    scores = decision["scores"]
    assert scores[0]["score"] >= scores[1]["score"]


@pytest.mark.asyncio
async def test_route_task_selects_python_agent_for_python_repo(
    client: AsyncClient,
) -> None:
    """Route a task to a Python repo — should pick py-expert."""
    payload = {
        "task": {
            "id": "task-202",
            "title": "Add API endpoint",
            "description": "Add /users endpoint",
            "type": "feature",
            "repo": "/test/py-repo",
            "created_at": datetime.now().isoformat(),
        },
        "agents": [
            {
                "id": "ts-expert",
                "name": "TS Expert",
                "description": "TS",
                "mcp_server": "copilot",
                "tools": ["edit_file"],
                "languages": ["typescript"],
                "frameworks": ["react"],
                "task_types": ["bug-fix", "feature"],
            },
            {
                "id": "py-expert",
                "name": "Python Expert",
                "description": "Python",
                "mcp_server": "copilot",
                "tools": ["edit_file", "read_file", "run_test"],
                "languages": ["python"],
                "frameworks": ["fastapi", "django"],
                "task_types": ["bug-fix", "feature"],
            },
        ],
        "repo_profile": {
            "path": "/test/py-repo",
            "languages": [{"name": "python", "percentage": 100.0}],
            "frameworks": ["fastapi"],
            "analyzed_at": datetime.now().isoformat(),
        },
    }

    resp = await client.post("/route", json=payload)
    assert resp.status_code == 200
    assert resp.json()["selected_agent_id"] == "py-expert"


@pytest.mark.asyncio
async def test_route_task_no_agents(client: AsyncClient) -> None:
    payload = {
        "task": {
            "id": "task-303",
            "title": "Do something",
            "description": "Stuff",
            "type": "bug-fix",
            "repo": "/test",
            "created_at": datetime.now().isoformat(),
        },
        "agents": [],
        "repo_profile": {
            "path": "/test",
            "languages": [],
            "frameworks": [],
            "analyzed_at": datetime.now().isoformat(),
        },
    }
    resp = await client.post("/route", json=payload)
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_route_task_no_repo_info(client: AsyncClient) -> None:
    payload = {
        "task": {
            "id": "task-404",
            "title": "Do something",
            "description": "Stuff",
            "type": "bug-fix",
            "repo": "/test",
            "created_at": datetime.now().isoformat(),
        },
        "agents": [
            {
                "id": "a1",
                "name": "Agent",
                "description": "Agent",
                "mcp_server": "s",
                "tools": [],
                "languages": [],
                "frameworks": [],
                "task_types": ["bug-fix"],
            }
        ],
    }
    resp = await client.post("/route", json=payload)
    assert resp.status_code == 400
    assert "repo_path or repo_profile" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_analyze_repo_endpoint(client: AsyncClient, tmp_path: str) -> None:
    """Test the /analyze endpoint with a real tmp directory."""
    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as td:
        p = Path(td)
        (p / "main.py").write_text("print('hello')")
        (p / "app.ts").write_text("const x = 1;")

        resp = await client.post(f"/analyze?repo_path={td}")
        assert resp.status_code == 200
        profile = resp.json()
        lang_names = [lang["name"] for lang in profile["languages"]]
        assert "python" in lang_names or "typescript" in lang_names
