"""Pydantic models mirroring core TypeScript contracts."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class TaskType(StrEnum):
    BUG_FIX = "bug-fix"
    FEATURE = "feature"
    REFACTOR = "refactor"
    TEST = "test"
    DOCS = "docs"
    REVIEW = "review"
    CUSTOM = "custom"


class Task(BaseModel):
    id: str
    title: str
    description: str
    type: TaskType
    repo: str
    branch: str | None = None
    files: list[str] | None = None
    metadata: dict[str, Any] | None = None
    created_at: datetime = Field(default_factory=datetime.now)


class LanguageInfo(BaseModel):
    name: str
    percentage: float


class RepoProfile(BaseModel):
    path: str
    languages: list[LanguageInfo]
    frameworks: list[str]
    build_system: str | None = None
    test_framework: str | None = None
    ci_config: str | None = None
    package_manager: str | None = None
    analyzed_at: datetime = Field(default_factory=datetime.now)


class AgentCapability(BaseModel):
    id: str
    name: str
    description: str
    mcp_server: str
    tools: list[str]
    languages: list[str]
    frameworks: list[str]
    task_types: list[TaskType]
    max_file_changes: int | None = None
    supports_streaming: bool = False


class RoutingScore(BaseModel):
    agent_id: str
    score: float = Field(ge=0.0, le=1.0)
    reasoning: str
    matched_criteria: list[str]


class RoutingDecision(BaseModel):
    task_id: str
    selected_agent_id: str
    scores: list[RoutingScore]
    confidence: float = Field(ge=0.0, le=1.0)
    fallback_chain: list[str]
    timestamp: datetime = Field(default_factory=datetime.now)


class VerificationCheckType(StrEnum):
    COMPILE = "compile"
    TYPECHECK = "typecheck"
    TEST = "test"
    LINT = "lint"
    DIFF_SCOPE = "diff-scope"
    CUSTOM = "custom"


class VerificationCheck(BaseModel):
    type: VerificationCheckType
    name: str
    passed: bool
    output: str | None = None
    duration_ms: float


class VerificationResult(BaseModel):
    workflow_id: str
    passed: bool
    checks: list[VerificationCheck]
    timestamp: datetime = Field(default_factory=datetime.now)
