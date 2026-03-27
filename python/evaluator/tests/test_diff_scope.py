"""Tests for the diff-scope checker."""

import subprocess
from pathlib import Path

import pytest

from evaluator.src.diff_scope import check_diff_scope


@pytest.fixture
def git_repo(tmp_path: Path) -> Path:
    """Create a minimal git repo with an initial commit."""
    repo = tmp_path / "repo"
    repo.mkdir()
    subprocess.run(["git", "init"], cwd=str(repo), capture_output=True, check=True)
    subprocess.run(
        ["git", "config", "user.email", "test@test.com"],
        cwd=str(repo), capture_output=True, check=True,
    )
    subprocess.run(
        ["git", "config", "user.name", "Test"],
        cwd=str(repo), capture_output=True, check=True,
    )
    (repo / "src").mkdir()
    (repo / "src" / "main.ts").write_text("const x = 1;")
    (repo / "README.md").write_text("# Hello")
    subprocess.run(["git", "add", "."], cwd=str(repo), capture_output=True, check=True)
    subprocess.run(
        ["git", "commit", "-m", "init"],
        cwd=str(repo), capture_output=True, check=True,
    )
    return repo


def test_no_changes_passes(git_repo: Path) -> None:
    result = check_diff_scope(str(git_repo))
    assert result.passed
    assert result.type.value == "diff-scope"


def test_changes_within_scope(git_repo: Path) -> None:
    (git_repo / "src" / "main.ts").write_text("const x = 2;")
    result = check_diff_scope(
        str(git_repo), allowed_paths=["src/"]
    )
    assert result.passed


def test_changes_outside_allowed_paths(git_repo: Path) -> None:
    (git_repo / "README.md").write_text("# Updated")
    result = check_diff_scope(
        str(git_repo), allowed_paths=["src/"]
    )
    assert not result.passed
    assert "outside allowed" in (result.output or "").lower()


def test_forbidden_path_violation(git_repo: Path) -> None:
    (git_repo / "README.md").write_text("# Hacked")
    result = check_diff_scope(
        str(git_repo), forbidden_paths=["README.md"]
    )
    assert not result.passed
    assert "forbidden" in (result.output or "").lower()


def test_max_file_changes_exceeded(git_repo: Path) -> None:
    (git_repo / "src" / "main.ts").write_text("changed")
    (git_repo / "README.md").write_text("changed")
    result = check_diff_scope(
        str(git_repo), max_file_changes=1
    )
    assert not result.passed
    assert "too many" in (result.output or "").lower()


def test_max_file_changes_within_limit(git_repo: Path) -> None:
    (git_repo / "src" / "main.ts").write_text("changed")
    result = check_diff_scope(
        str(git_repo), max_file_changes=5
    )
    assert result.passed


def test_invalid_repo_path() -> None:
    result = check_diff_scope("/nonexistent/path")
    assert not result.passed


def test_duration_is_recorded(git_repo: Path) -> None:
    result = check_diff_scope(str(git_repo))
    assert result.duration_ms >= 0
