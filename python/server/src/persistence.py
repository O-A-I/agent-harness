"""SQLite persistence layer for Agent Harness.

Stores workflow runs, routing decisions, verification results, and daily progress.
Supports JSON export/import for portability.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

from router.src.models import (
    RoutingDecision,
    VerificationResult,
)

DB_SCHEMA = """
CREATE TABLE IF NOT EXISTS workflow_runs (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    phase TEXT NOT NULL DEFAULT 'Created',
    agent_id TEXT,
    plan_json TEXT,
    execution_result_json TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_transitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_id TEXT NOT NULL,
    from_phase TEXT NOT NULL,
    to_phase TEXT NOT NULL,
    reason TEXT,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (workflow_id) REFERENCES workflow_runs(id)
);

CREATE TABLE IF NOT EXISTS routing_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    selected_agent_id TEXT NOT NULL,
    confidence REAL NOT NULL,
    scores_json TEXT NOT NULL,
    fallback_chain_json TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (workflow_id) REFERENCES workflow_runs(id)
);

CREATE TABLE IF NOT EXISTS verification_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_id TEXT NOT NULL,
    passed INTEGER NOT NULL,
    checks_json TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (workflow_id) REFERENCES workflow_runs(id)
);

CREATE TABLE IF NOT EXISTS daily_progress (
    date TEXT PRIMARY KEY,
    workflows_started INTEGER NOT NULL DEFAULT 0,
    workflows_completed INTEGER NOT NULL DEFAULT 0,
    workflows_failed INTEGER NOT NULL DEFAULT 0,
    tasks_routed INTEGER NOT NULL DEFAULT 0,
    verifications_run INTEGER NOT NULL DEFAULT 0,
    verification_pass_rate REAL NOT NULL DEFAULT 0.0,
    top_agents_json TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_workflow_task ON workflow_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_transitions_workflow ON workflow_transitions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_routing_workflow ON routing_decisions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_verification_workflow ON verification_results(workflow_id);
"""


class HarnessDB:
    """SQLite persistence for Agent Harness workflow data."""

    def __init__(self, db_path: str | Path = ":memory:"):
        self.db_path = str(db_path)
        self._conn: sqlite3.Connection | None = None
        self._ensure_schema()

    def _get_conn(self) -> sqlite3.Connection:
        if self._conn is None:
            self._conn = sqlite3.connect(self.db_path)
            self._conn.row_factory = sqlite3.Row
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA foreign_keys=ON")
        return self._conn

    def _ensure_schema(self) -> None:
        conn = self._get_conn()
        conn.executescript(DB_SCHEMA)
        conn.commit()

    def close(self) -> None:
        if self._conn:
            self._conn.close()
            self._conn = None

    # ── Workflow CRUD ──

    def save_workflow(
        self,
        workflow_id: str,
        task_id: str,
        phase: str = "Created",
        agent_id: str | None = None,
        plan_json: str | None = None,
        execution_result_json: str | None = None,
        error: str | None = None,
    ) -> None:
        now = datetime.now().isoformat()
        conn = self._get_conn()
        conn.execute(
            """INSERT INTO workflow_runs (id, task_id, phase, agent_id, plan_json,
               execution_result_json, error, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 phase=excluded.phase, agent_id=excluded.agent_id,
                 plan_json=excluded.plan_json,
                 execution_result_json=excluded.execution_result_json,
                 error=excluded.error, updated_at=excluded.updated_at""",
            (workflow_id, task_id, phase, agent_id, plan_json,
             execution_result_json, error, now, now),
        )
        conn.commit()

    def get_workflow(self, workflow_id: str) -> dict[str, Any] | None:
        conn = self._get_conn()
        row = conn.execute(
            "SELECT * FROM workflow_runs WHERE id = ?", (workflow_id,)
        ).fetchone()
        if row is None:
            return None
        return dict(row)

    def list_workflows(
        self, phase: str | None = None, limit: int = 100
    ) -> list[dict[str, Any]]:
        conn = self._get_conn()
        if phase:
            rows = conn.execute(
                "SELECT * FROM workflow_runs WHERE phase = ? ORDER BY updated_at DESC LIMIT ?",
                (phase, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM workflow_runs ORDER BY updated_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]

    def update_workflow_phase(self, workflow_id: str, phase: str) -> None:
        conn = self._get_conn()
        conn.execute(
            "UPDATE workflow_runs SET phase = ?, updated_at = ? WHERE id = ?",
            (phase, datetime.now().isoformat(), workflow_id),
        )
        conn.commit()

    # ── Transitions ──

    def save_transition(
        self,
        workflow_id: str,
        from_phase: str,
        to_phase: str,
        reason: str | None = None,
    ) -> None:
        conn = self._get_conn()
        conn.execute(
            """INSERT INTO workflow_transitions
               (workflow_id, from_phase, to_phase, reason, timestamp)
               VALUES (?, ?, ?, ?, ?)""",
            (workflow_id, from_phase, to_phase, reason, datetime.now().isoformat()),
        )
        conn.commit()

    def get_transitions(self, workflow_id: str) -> list[dict[str, Any]]:
        conn = self._get_conn()
        rows = conn.execute(
            "SELECT * FROM workflow_transitions WHERE workflow_id = ? ORDER BY timestamp",
            (workflow_id,),
        ).fetchall()
        return [dict(r) for r in rows]

    # ── Routing Decisions ──

    def save_routing_decision(
        self, workflow_id: str, decision: RoutingDecision
    ) -> None:
        conn = self._get_conn()
        conn.execute(
            """INSERT INTO routing_decisions (workflow_id, task_id, selected_agent_id,
               confidence, scores_json, fallback_chain_json, timestamp)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                workflow_id,
                decision.task_id,
                decision.selected_agent_id,
                decision.confidence,
                json.dumps([s.model_dump(mode="json") for s in decision.scores]),
                json.dumps(decision.fallback_chain),
                decision.timestamp.isoformat(),
            ),
        )
        conn.commit()

    def get_routing_decisions(self, workflow_id: str) -> list[dict[str, Any]]:
        conn = self._get_conn()
        rows = conn.execute(
            "SELECT * FROM routing_decisions WHERE workflow_id = ? ORDER BY timestamp",
            (workflow_id,),
        ).fetchall()
        return [dict(r) for r in rows]

    # ── Verification Results ──

    def save_verification_result(
        self, result: VerificationResult
    ) -> None:
        conn = self._get_conn()
        conn.execute(
            """INSERT INTO verification_results (workflow_id, passed, checks_json, timestamp)
               VALUES (?, ?, ?, ?)""",
            (
                result.workflow_id,
                int(result.passed),
                json.dumps([c.model_dump(mode="json") for c in result.checks]),
                result.timestamp.isoformat(),
            ),
        )
        conn.commit()

    def get_verification_results(self, workflow_id: str) -> list[dict[str, Any]]:
        conn = self._get_conn()
        rows = conn.execute(
            "SELECT * FROM verification_results WHERE workflow_id = ? ORDER BY timestamp",
            (workflow_id,),
        ).fetchall()
        return [dict(r) for r in rows]

    # ── Daily Progress ──

    def update_daily_progress(
        self,
        date: str | None = None,
        started: int = 0,
        completed: int = 0,
        failed: int = 0,
        routed: int = 0,
        verifications: int = 0,
    ) -> None:
        date = date or datetime.now().strftime("%Y-%m-%d")
        conn = self._get_conn()
        conn.execute(
            """INSERT INTO daily_progress (date, workflows_started, workflows_completed,
               workflows_failed, tasks_routed, verifications_run)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(date) DO UPDATE SET
                 workflows_started = workflows_started + excluded.workflows_started,
                 workflows_completed = workflows_completed + excluded.workflows_completed,
                 workflows_failed = workflows_failed + excluded.workflows_failed,
                 tasks_routed = tasks_routed + excluded.tasks_routed,
                 verifications_run = verifications_run + excluded.verifications_run""",
            (date, started, completed, failed, routed, verifications),
        )
        conn.commit()

    def get_daily_progress(self, date: str | None = None) -> dict[str, Any] | None:
        date = date or datetime.now().strftime("%Y-%m-%d")
        conn = self._get_conn()
        row = conn.execute(
            "SELECT * FROM daily_progress WHERE date = ?", (date,)
        ).fetchone()
        return dict(row) if row else None

    def get_progress_range(
        self, start_date: str, end_date: str
    ) -> list[dict[str, Any]]:
        conn = self._get_conn()
        rows = conn.execute(
            "SELECT * FROM daily_progress WHERE date BETWEEN ? AND ? ORDER BY date",
            (start_date, end_date),
        ).fetchall()
        return [dict(r) for r in rows]

    # ── Stats (for dashboard) ──

    def get_agent_stats(self) -> list[dict[str, Any]]:
        """Get task counts per agent."""
        conn = self._get_conn()
        rows = conn.execute(
            """SELECT agent_id, COUNT(*) as total,
               SUM(CASE WHEN phase = 'Done' THEN 1 ELSE 0 END) as completed,
               SUM(CASE WHEN phase = 'Failed' THEN 1 ELSE 0 END) as failed
               FROM workflow_runs WHERE agent_id IS NOT NULL
               GROUP BY agent_id ORDER BY total DESC"""
        ).fetchall()
        return [dict(r) for r in rows]

    def get_verification_stats(self) -> dict[str, Any]:
        """Get aggregate verification statistics."""
        conn = self._get_conn()
        row = conn.execute(
            """SELECT COUNT(*) as total,
               SUM(CASE WHEN passed THEN 1 ELSE 0 END) as passed,
               SUM(CASE WHEN NOT passed THEN 1 ELSE 0 END) as failed
               FROM verification_results"""
        ).fetchone()
        if row is None:
            return {"total": 0, "passed": 0, "failed": 0, "pass_rate": 0.0}
        total = row["total"]
        passed = row["passed"]
        return {
            "total": total,
            "passed": passed,
            "failed": row["failed"],
            "pass_rate": round(passed / total * 100, 1) if total > 0 else 0.0,
        }

    # ── Export / Import ──

    def export_json(self) -> dict[str, Any]:
        """Export all data as a JSON-serializable dict."""
        conn = self._get_conn()
        return {
            "version": "1",
            "exported_at": datetime.now().isoformat(),
            "workflows": [dict(r) for r in conn.execute("SELECT * FROM workflow_runs").fetchall()],
            "transitions": [
                dict(r) for r in conn.execute("SELECT * FROM workflow_transitions").fetchall()
            ],
            "routing_decisions": [
                dict(r) for r in conn.execute("SELECT * FROM routing_decisions").fetchall()
            ],
            "verification_results": [
                dict(r) for r in conn.execute("SELECT * FROM verification_results").fetchall()
            ],
            "daily_progress": [
                dict(r) for r in conn.execute("SELECT * FROM daily_progress").fetchall()
            ],
        }

    def import_json(self, data: dict[str, Any]) -> int:
        """Import data from a JSON dict. Returns count of records imported."""
        conn = self._get_conn()
        count = 0

        for wf in data.get("workflows", []):
            conn.execute(
                """INSERT OR REPLACE INTO workflow_runs
                   (id, task_id, phase, agent_id, plan_json,
                    execution_result_json, error, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (wf["id"], wf["task_id"], wf["phase"], wf.get("agent_id"),
                 wf.get("plan_json"), wf.get("execution_result_json"),
                 wf.get("error"), wf["created_at"], wf["updated_at"]),
            )
            count += 1

        for t in data.get("transitions", []):
            conn.execute(
                """INSERT INTO workflow_transitions
                   (workflow_id, from_phase, to_phase, reason, timestamp)
                   VALUES (?, ?, ?, ?, ?)""",
                (t["workflow_id"], t["from_phase"], t["to_phase"],
                 t.get("reason"), t["timestamp"]),
            )
            count += 1

        for rd in data.get("routing_decisions", []):
            conn.execute(
                """INSERT INTO routing_decisions
                   (workflow_id, task_id, selected_agent_id, confidence,
                    scores_json, fallback_chain_json, timestamp)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (rd["workflow_id"], rd["task_id"], rd["selected_agent_id"],
                 rd["confidence"], rd["scores_json"],
                 rd["fallback_chain_json"], rd["timestamp"]),
            )
            count += 1

        for vr in data.get("verification_results", []):
            conn.execute(
                """INSERT INTO verification_results (workflow_id, passed, checks_json, timestamp)
                   VALUES (?, ?, ?, ?)""",
                (vr["workflow_id"], vr["passed"], vr["checks_json"], vr["timestamp"]),
            )
            count += 1

        for dp in data.get("daily_progress", []):
            conn.execute(
                """INSERT OR REPLACE INTO daily_progress
                   (date, workflows_started, workflows_completed, workflows_failed,
                    tasks_routed, verifications_run, verification_pass_rate, top_agents_json)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (dp["date"], dp["workflows_started"], dp["workflows_completed"],
                 dp["workflows_failed"], dp["tasks_routed"], dp["verifications_run"],
                 dp.get("verification_pass_rate", 0.0), dp.get("top_agents_json", "[]")),
            )
            count += 1

        conn.commit()
        return count
