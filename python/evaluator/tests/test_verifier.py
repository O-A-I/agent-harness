"""Tests for the verification engine."""

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from evaluator.src.verifier import VerificationConfig, run_check, verify
from router.src.models import VerificationCheckType


@pytest.mark.asyncio
async def test_run_check_command_not_found() -> None:
    result = await run_check(
        VerificationCheckType.COMPILE,
        custom_command=["nonexistent_cmd_12345"],
    )
    assert not result.passed
    assert "not found" in result.output.lower() or "Command not found" in result.output


@pytest.mark.asyncio
async def test_run_check_success() -> None:
    result = await run_check(
        VerificationCheckType.CUSTOM,
        custom_command=["echo", "hello"],
    )
    assert result.passed
    assert "hello" in result.output
    assert result.duration_ms >= 0


@pytest.mark.asyncio
async def test_run_check_failure() -> None:
    result = await run_check(
        VerificationCheckType.CUSTOM,
        custom_command=["sh", "-c", "exit 1"],
    )
    assert not result.passed


@pytest.mark.asyncio
async def test_run_check_timeout() -> None:
    result = await run_check(
        VerificationCheckType.CUSTOM,
        custom_command=["sleep", "10"],
        timeout=0.1,
    )
    assert not result.passed
    assert "timed out" in result.output.lower()


@pytest.mark.asyncio
async def test_verify_all_pass() -> None:
    config = VerificationConfig(
        checks=[],
        custom_commands=[
            {"name": "echo-test", "command": "echo OK"},
            {"name": "true-test", "command": "true"},
        ],
    )
    result = await verify("wf-1", config)
    assert result.passed
    assert len(result.checks) == 2
    assert all(c.passed for c in result.checks)


@pytest.mark.asyncio
async def test_verify_one_fails() -> None:
    config = VerificationConfig(
        checks=[],
        custom_commands=[
            {"name": "pass", "command": "true"},
            {"name": "fail", "command": "false"},
        ],
    )
    result = await verify("wf-2", config)
    assert not result.passed
    assert result.checks[0].passed
    assert not result.checks[1].passed


@pytest.mark.asyncio
async def test_verify_no_checks() -> None:
    config = VerificationConfig(checks=[], custom_commands=[])
    result = await verify("wf-3", config)
    assert result.passed
    assert len(result.checks) == 0
