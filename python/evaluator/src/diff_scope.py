"""Diff-scope checker — verifies agent changes stay within allowed boundaries."""

from __future__ import annotations

import subprocess
from pathlib import Path

from router.src.models import VerificationCheck, VerificationCheckType


def check_diff_scope(
    repo_path: str,
    allowed_paths: list[str] | None = None,
    forbidden_paths: list[str] | None = None,
    max_file_changes: int | None = None,
) -> VerificationCheck:
    """Check that git changes are within scope.

    - Ensures changed files are within allowed_paths (if specified)
    - Ensures no changes in forbidden_paths
    - Ensures total changed files <= max_file_changes
    """
    import time

    start = time.monotonic()

    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", "HEAD"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            timeout=10,
        )
        changed_files = [f for f in result.stdout.strip().split("\n") if f]
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        duration = (time.monotonic() - start) * 1000
        return VerificationCheck(
            type=VerificationCheckType.DIFF_SCOPE,
            name="diff-scope",
            passed=False,
            output=f"Failed to get git diff: {e}",
            duration_ms=round(duration, 1),
        )

    violations: list[str] = []

    # Check max file changes
    if max_file_changes is not None and len(changed_files) > max_file_changes:
        violations.append(
            f"Too many files changed: {len(changed_files)} > {max_file_changes}"
        )

    # Check forbidden paths
    if forbidden_paths:
        for f in changed_files:
            for fp in forbidden_paths:
                if f.startswith(fp) or f == fp:
                    violations.append(f"Forbidden path modified: {f}")

    # Check allowed paths
    if allowed_paths:
        for f in changed_files:
            if not any(f.startswith(ap) for ap in allowed_paths):
                violations.append(f"File outside allowed paths: {f}")

    duration = (time.monotonic() - start) * 1000
    passed = len(violations) == 0

    return VerificationCheck(
        type=VerificationCheckType.DIFF_SCOPE,
        name="diff-scope",
        passed=passed,
        output="\n".join(violations) if violations else f"{len(changed_files)} files changed, all in scope",
        duration_ms=round(duration, 1),
    )
