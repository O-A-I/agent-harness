"""Tests for the persistence layer."""

import json

import pytest

from router.src.models import (
    RoutingDecision,
    RoutingScore,
    VerificationCheck,
    VerificationCheckType,
    VerificationResult,
)
from server.src.persistence import HarnessDB


@pytest.fixture
def db() -> HarnessDB:
    return HarnessDB(":memory:")


class TestWorkflowCRUD:
    def test_save_and_get_workflow(self, db: HarnessDB) -> None:
        db.save_workflow("wf-1", "task-1", phase="Created")
        wf = db.get_workflow("wf-1")
        assert wf is not None
        assert wf["id"] == "wf-1"
        assert wf["task_id"] == "task-1"
        assert wf["phase"] == "Created"

    def test_get_nonexistent_workflow(self, db: HarnessDB) -> None:
        assert db.get_workflow("nonexistent") is None

    def test_update_workflow_phase(self, db: HarnessDB) -> None:
        db.save_workflow("wf-1", "task-1", phase="Created")
        db.update_workflow_phase("wf-1", "Planning")
        wf = db.get_workflow("wf-1")
        assert wf is not None
        assert wf["phase"] == "Planning"

    def test_upsert_workflow(self, db: HarnessDB) -> None:
        db.save_workflow("wf-1", "task-1", phase="Created")
        db.save_workflow("wf-1", "task-1", phase="Done", agent_id="agent-1")
        wf = db.get_workflow("wf-1")
        assert wf is not None
        assert wf["phase"] == "Done"
        assert wf["agent_id"] == "agent-1"

    def test_list_workflows(self, db: HarnessDB) -> None:
        db.save_workflow("wf-1", "t1", phase="Done")
        db.save_workflow("wf-2", "t2", phase="Failed")
        db.save_workflow("wf-3", "t3", phase="Done")

        all_wfs = db.list_workflows()
        assert len(all_wfs) == 3

        done_wfs = db.list_workflows(phase="Done")
        assert len(done_wfs) == 2

    def test_list_workflows_limit(self, db: HarnessDB) -> None:
        for i in range(10):
            db.save_workflow(f"wf-{i}", f"t-{i}")
        result = db.list_workflows(limit=3)
        assert len(result) == 3


class TestTransitions:
    def test_save_and_get_transitions(self, db: HarnessDB) -> None:
        db.save_workflow("wf-1", "task-1")
        db.save_transition("wf-1", "Created", "Planning", reason="starting")
        db.save_transition("wf-1", "Planning", "Planned")

        transitions = db.get_transitions("wf-1")
        assert len(transitions) == 2
        assert transitions[0]["from_phase"] == "Created"
        assert transitions[0]["to_phase"] == "Planning"
        assert transitions[0]["reason"] == "starting"

    def test_empty_transitions(self, db: HarnessDB) -> None:
        transitions = db.get_transitions("nonexistent")
        assert transitions == []


class TestRoutingDecisions:
    def test_save_and_get_routing_decision(self, db: HarnessDB) -> None:
        db.save_workflow("wf-1", "task-1")
        decision = RoutingDecision(
            task_id="task-1",
            selected_agent_id="agent-1",
            scores=[
                RoutingScore(
                    agent_id="agent-1",
                    score=0.9,
                    reasoning="Good match",
                    matched_criteria=["language"],
                )
            ],
            confidence=0.9,
            fallback_chain=["agent-2"],
        )
        db.save_routing_decision("wf-1", decision)

        decisions = db.get_routing_decisions("wf-1")
        assert len(decisions) == 1
        assert decisions[0]["selected_agent_id"] == "agent-1"
        assert decisions[0]["confidence"] == 0.9


class TestVerificationResults:
    def test_save_and_get_verification_result(self, db: HarnessDB) -> None:
        db.save_workflow("wf-1", "task-1")
        result = VerificationResult(
            workflow_id="wf-1",
            passed=True,
            checks=[
                VerificationCheck(
                    type=VerificationCheckType.COMPILE,
                    name="compile",
                    passed=True,
                    duration_ms=500,
                ),
                VerificationCheck(
                    type=VerificationCheckType.TEST,
                    name="test",
                    passed=True,
                    duration_ms=1000,
                ),
            ],
        )
        db.save_verification_result(result)

        results = db.get_verification_results("wf-1")
        assert len(results) == 1
        assert results[0]["passed"] == 1
        checks = json.loads(results[0]["checks_json"])
        assert len(checks) == 2


class TestDailyProgress:
    def test_update_and_get_progress(self, db: HarnessDB) -> None:
        db.update_daily_progress(date="2026-03-25", started=2, completed=1)
        progress = db.get_daily_progress("2026-03-25")
        assert progress is not None
        assert progress["workflows_started"] == 2
        assert progress["workflows_completed"] == 1

    def test_accumulative_progress(self, db: HarnessDB) -> None:
        db.update_daily_progress(date="2026-03-25", started=2)
        db.update_daily_progress(date="2026-03-25", started=3, completed=1)
        progress = db.get_daily_progress("2026-03-25")
        assert progress is not None
        assert progress["workflows_started"] == 5
        assert progress["workflows_completed"] == 1

    def test_get_progress_range(self, db: HarnessDB) -> None:
        db.update_daily_progress(date="2026-03-24", started=1)
        db.update_daily_progress(date="2026-03-25", started=2)
        db.update_daily_progress(date="2026-03-26", started=3)

        result = db.get_progress_range("2026-03-24", "2026-03-25")
        assert len(result) == 2

    def test_no_progress(self, db: HarnessDB) -> None:
        assert db.get_daily_progress("2020-01-01") is None


class TestStats:
    def test_agent_stats(self, db: HarnessDB) -> None:
        db.save_workflow("wf-1", "t1", phase="Done", agent_id="agent-1")
        db.save_workflow("wf-2", "t2", phase="Done", agent_id="agent-1")
        db.save_workflow("wf-3", "t3", phase="Failed", agent_id="agent-2")

        stats = db.get_agent_stats()
        assert len(stats) == 2
        agent1 = next(s for s in stats if s["agent_id"] == "agent-1")
        assert agent1["total"] == 2
        assert agent1["completed"] == 2

    def test_verification_stats_empty(self, db: HarnessDB) -> None:
        stats = db.get_verification_stats()
        assert stats["total"] == 0
        assert stats["pass_rate"] == 0.0

    def test_verification_stats(self, db: HarnessDB) -> None:
        db.save_workflow("wf-1", "t1")
        for i, passed in enumerate([True, True, False]):
            result = VerificationResult(
                workflow_id="wf-1",
                passed=passed,
                checks=[
                    VerificationCheck(
                        type=VerificationCheckType.TEST,
                        name="test",
                        passed=passed,
                        duration_ms=100,
                    )
                ],
            )
            db.save_verification_result(result)

        stats = db.get_verification_stats()
        assert stats["total"] == 3
        assert stats["passed"] == 2
        assert stats["failed"] == 1
        assert stats["pass_rate"] == 66.7


class TestExportImport:
    def test_export_json(self, db: HarnessDB) -> None:
        db.save_workflow("wf-1", "task-1", phase="Done", agent_id="a1")
        db.save_transition("wf-1", "Created", "Done")
        db.update_daily_progress(date="2026-03-25", started=1, completed=1)

        export = db.export_json()
        assert export["version"] == "1"
        assert len(export["workflows"]) == 1
        assert len(export["transitions"]) == 1
        assert len(export["daily_progress"]) == 1

    def test_import_json(self, db: HarnessDB) -> None:
        data = {
            "version": "1",
            "workflows": [
                {
                    "id": "wf-imp",
                    "task_id": "t-imp",
                    "phase": "Done",
                    "agent_id": "a1",
                    "plan_json": None,
                    "execution_result_json": None,
                    "error": None,
                    "created_at": "2026-01-01T00:00:00",
                    "updated_at": "2026-01-01T01:00:00",
                }
            ],
            "transitions": [],
            "routing_decisions": [],
            "verification_results": [],
            "daily_progress": [],
        }
        count = db.import_json(data)
        assert count == 1

        wf = db.get_workflow("wf-imp")
        assert wf is not None
        assert wf["phase"] == "Done"

    def test_roundtrip_export_import(self, db: HarnessDB) -> None:
        db.save_workflow("wf-rt", "t-rt", phase="Done")
        db.save_transition("wf-rt", "Created", "Done")

        exported = db.export_json()

        db2 = HarnessDB(":memory:")
        count = db2.import_json(exported)
        assert count >= 2

        wf = db2.get_workflow("wf-rt")
        assert wf is not None
        assert wf["phase"] == "Done"

        transitions = db2.get_transitions("wf-rt")
        assert len(transitions) == 1
