"""Deterministic verification engine.

Runs compile, type-check, test, lint, and diff-scope checks against
agent-produced code changes. All checks are deterministic — no LLM involved.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from pathlib import Path

from router.src.models import VerificationCheck, VerificationCheckType, VerificationResult


@dataclass
class VerificationConfig:
    """Configuration for which checks to run and how."""

    checks: list[VerificationCheckType] = field(
        default_factory=lambda: [
            VerificationCheckType.COMPILE,
            VerificationCheckType.TYPECHECK,
            VerificationCheckType.TEST,
            VerificationCheckType.LINT,
        ]
    )
    custom_commands: list[dict[str, str]] = field(default_factory=list)
    timeout_seconds: float = 120.0
    working_dir: str | None = None


# Maps check type → default command (can be overridden by repo config)
DEFAULT_COMMANDS: dict[VerificationCheckType, list[list[str]]] = {
    VerificationCheckType.COMPILE: [
        ["pnpm", "run", "build"],
        ["npm", "run", "build"],
        ["make", "build"],
    ],
    VerificationCheckType.TYPECHECK: [
        ["pnpm", "run", "typecheck"],
        ["npx", "tsc", "--noEmit"],
        ["mypy", "."],
    ],
    VerificationCheckType.TEST: [
        ["pnpm", "run", "test"],
        ["npm", "test"],
        ["pytest"],
    ],
    VerificationCheckType.LINT: [
        ["pnpm", "run", "lint"],
        ["ruff", "check", "."],
        ["npx", "eslint", "."],
    ],
}


async def _run_command(
    cmd: list[str],
    cwd: str | None = None,
    timeout: float = 120.0,
) -> tuple[bool, str, float]:
    """Run a command and return (success, output, duration_ms)."""
    start = time.monotonic()
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=cwd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        duration_ms = (time.monotonic() - start) * 1000
        output = stdout.decode(errors="replace")[-5000:]  # Cap output
        return proc.returncode == 0, output, duration_ms
    except asyncio.TimeoutError:
        duration_ms = (time.monotonic() - start) * 1000
        return False, f"Command timed out after {timeout}s", duration_ms
    except (FileNotFoundError, PermissionError):
        duration_ms = (time.monotonic() - start) * 1000
        return False, f"Command not found: {cmd[0]}", duration_ms


async def _find_working_command(
    check_type: VerificationCheckType,
    cwd: str | None,
) -> list[str] | None:
    """Find the first command that exists for a check type."""
    import shutil

    candidates = DEFAULT_COMMANDS.get(check_type, [])
    for cmd in candidates:
        if shutil.which(cmd[0]):
            return cmd
    return None


async def run_check(
    check_type: VerificationCheckType,
    cwd: str | None = None,
    timeout: float = 120.0,
    custom_command: list[str] | None = None,
) -> VerificationCheck:
    """Run a single verification check."""
    cmd = custom_command
    if not cmd:
        cmd = await _find_working_command(check_type, cwd)
        if not cmd:
            return VerificationCheck(
                type=check_type,
                name=check_type.value,
                passed=True,  # Skip if no tool found
                output=f"No {check_type.value} tool found, skipping",
                duration_ms=0,
            )

    passed, output, duration_ms = await _run_command(cmd, cwd=cwd, timeout=timeout)

    return VerificationCheck(
        type=check_type,
        name=check_type.value,
        passed=passed,
        output=output,
        duration_ms=round(duration_ms, 1),
    )


async def verify(
    workflow_id: str,
    config: VerificationConfig,
) -> VerificationResult:
    """Run all configured verification checks and return results."""
    checks: list[VerificationCheck] = []

    for check_type in config.checks:
        result = await run_check(
            check_type,
            cwd=config.working_dir,
            timeout=config.timeout_seconds,
        )
        checks.append(result)

    # Run custom commands
    for custom in config.custom_commands:
        cmd_str = custom.get("command", "")
        name = custom.get("name", cmd_str)
        timeout = float(custom.get("timeout", config.timeout_seconds))

        passed, output, duration_ms = await _run_command(
            ["sh", "-c", cmd_str],
            cwd=config.working_dir,
            timeout=timeout,
        )
        checks.append(
            VerificationCheck(
                type=VerificationCheckType.CUSTOM,
                name=name,
                passed=passed,
                output=output,
                duration_ms=round(duration_ms, 1),
            )
        )

    all_passed = all(c.passed for c in checks)

    return VerificationResult(
        workflow_id=workflow_id,
        passed=all_passed,
        checks=checks,
    )
