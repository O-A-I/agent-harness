"""Tests for the applicability scorer and router."""

from datetime import datetime

import pytest

from router.src.models import AgentCapability, LanguageInfo, RepoProfile, Task, TaskType
from router.src.scorer import route_task, score_agent


@pytest.fixture
def ts_react_repo() -> RepoProfile:
    return RepoProfile(
        path="/test/repo",
        languages=[
            LanguageInfo(name="typescript", percentage=80.0),
            LanguageInfo(name="javascript", percentage=20.0),
        ],
        frameworks=["react", "nextjs"],
        build_system="turborepo",
        test_framework="vitest",
        package_manager="pnpm",
        analyzed_at=datetime.now(),
    )


@pytest.fixture
def python_repo() -> RepoProfile:
    return RepoProfile(
        path="/test/py-repo",
        languages=[LanguageInfo(name="python", percentage=100.0)],
        frameworks=["fastapi"],
        build_system=None,
        test_framework="pytest",
        package_manager="uv",
        analyzed_at=datetime.now(),
    )


@pytest.fixture
def ts_agent() -> AgentCapability:
    return AgentCapability(
        id="ts-expert",
        name="TypeScript Expert",
        description="Expert at TypeScript and React",
        mcp_server="copilot",
        tools=["edit_file", "read_file", "run_test", "git_commit", "search"],
        languages=["typescript", "javascript"],
        frameworks=["react", "nextjs"],
        task_types=[TaskType.BUG_FIX, TaskType.FEATURE, TaskType.REFACTOR],
    )


@pytest.fixture
def py_agent() -> AgentCapability:
    return AgentCapability(
        id="py-expert",
        name="Python Expert",
        description="Expert at Python backend",
        mcp_server="copilot",
        tools=["edit_file", "read_file", "run_test"],
        languages=["python"],
        frameworks=["fastapi", "django"],
        task_types=[TaskType.BUG_FIX, TaskType.FEATURE],
    )


@pytest.fixture
def generic_agent() -> AgentCapability:
    return AgentCapability(
        id="generic",
        name="Generic Agent",
        description="Handles anything",
        mcp_server="generic-server",
        tools=["edit_file"],
        languages=[],
        frameworks=[],
        task_types=[TaskType.BUG_FIX, TaskType.FEATURE, TaskType.REFACTOR, TaskType.TEST, TaskType.DOCS],
    )


def make_task(task_type: TaskType = TaskType.BUG_FIX) -> Task:
    return Task(
        id="task-1",
        title="Fix the bug",
        description="Something is broken",
        type=task_type,
        repo="/test/repo",
    )


class TestScoreAgent:
    def test_perfect_match_scores_high(
        self, ts_react_repo: RepoProfile, ts_agent: AgentCapability
    ) -> None:
        task = make_task(TaskType.BUG_FIX)
        result = score_agent(task, ts_react_repo, ts_agent)
        assert result.score >= 0.8
        assert result.agent_id == "ts-expert"
        assert len(result.matched_criteria) >= 2

    def test_language_mismatch_scores_low(
        self, ts_react_repo: RepoProfile, py_agent: AgentCapability
    ) -> None:
        task = make_task(TaskType.BUG_FIX)
        result = score_agent(task, ts_react_repo, py_agent)
        assert result.score < 0.5

    def test_task_type_mismatch_reduces_score(
        self, ts_react_repo: RepoProfile, ts_agent: AgentCapability
    ) -> None:
        task = make_task(TaskType.DOCS)  # ts_agent doesn't handle docs
        result = score_agent(task, ts_react_repo, ts_agent)
        # Should still get some score from language/framework match
        assert result.score < 0.8

    def test_generic_agent_gets_partial_credit(
        self, ts_react_repo: RepoProfile, generic_agent: AgentCapability
    ) -> None:
        task = make_task(TaskType.BUG_FIX)
        result = score_agent(task, ts_react_repo, generic_agent)
        # Should get partial credit for unrestricted languages/frameworks
        assert 0.3 < result.score < 0.8


class TestRouteTask:
    def test_routes_to_best_agent(
        self,
        ts_react_repo: RepoProfile,
        ts_agent: AgentCapability,
        py_agent: AgentCapability,
        generic_agent: AgentCapability,
    ) -> None:
        task = make_task(TaskType.BUG_FIX)
        decision = route_task(task, ts_react_repo, [ts_agent, py_agent, generic_agent])
        assert decision.selected_agent_id == "ts-expert"
        assert decision.confidence > 0.5
        assert len(decision.scores) == 3

    def test_routes_python_task_to_py_agent(
        self,
        python_repo: RepoProfile,
        ts_agent: AgentCapability,
        py_agent: AgentCapability,
    ) -> None:
        task = make_task(TaskType.FEATURE)
        decision = route_task(task, python_repo, [ts_agent, py_agent])
        assert decision.selected_agent_id == "py-expert"

    def test_fallback_chain_excludes_low_scores(
        self,
        ts_react_repo: RepoProfile,
        ts_agent: AgentCapability,
        py_agent: AgentCapability,
    ) -> None:
        task = make_task(TaskType.BUG_FIX)
        decision = route_task(task, ts_react_repo, [ts_agent, py_agent])
        # py_agent should score low for TS repo, may not be in fallback
        assert decision.selected_agent_id == "ts-expert"

    def test_raises_on_no_agents(self, ts_react_repo: RepoProfile) -> None:
        task = make_task()
        with pytest.raises(ValueError, match="No agents available"):
            route_task(task, ts_react_repo, [])

    def test_single_agent_routing(
        self, ts_react_repo: RepoProfile, ts_agent: AgentCapability
    ) -> None:
        task = make_task()
        decision = route_task(task, ts_react_repo, [ts_agent])
        assert decision.selected_agent_id == "ts-expert"
        assert decision.fallback_chain == []
