"""Tests for isolated execution via git worktrees."""

import subprocess
from pathlib import Path

import pytest

from evaluator.src.isolated_exec import IsolatedExecutor


@pytest.fixture
def git_repo(tmp_path: Path) -> Path:
    """Create a minimal git repo for testing."""
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
    (repo / "README.md").write_text("# Test\n")
    subprocess.run(["git", "add", "."], cwd=str(repo), capture_output=True, check=True)
    subprocess.run(
        ["git", "commit", "-m", "Initial commit"],
        cwd=str(repo), capture_output=True, check=True,
    )
    return repo


@pytest.fixture
def executor(tmp_path: Path) -> IsolatedExecutor:
    worktree_dir = tmp_path / "worktrees"
    worktree_dir.mkdir()
    return IsolatedExecutor(str(worktree_dir))


class TestIsolatedExecutor:
    def test_create_workspace(
        self, executor: IsolatedExecutor, git_repo: Path
    ) -> None:
        ws = executor.create_workspace("test-ws", str(git_repo))
        assert ws.workspace_id == "test-ws"
        assert ws.is_active
        assert Path(ws.worktree_path).exists()
        assert ws.branch == "harness/test-ws"

    def test_create_workspace_not_git_repo(
        self, executor: IsolatedExecutor, tmp_path: Path
    ) -> None:
        non_git = tmp_path / "not-a-repo"
        non_git.mkdir()
        with pytest.raises(ValueError, match="Not a git repository"):
            executor.create_workspace("ws", str(non_git))

    def test_get_workspace(
        self, executor: IsolatedExecutor, git_repo: Path
    ) -> None:
        executor.create_workspace("ws-1", str(git_repo))
        ws = executor.get_workspace("ws-1")
        assert ws is not None
        assert ws.workspace_id == "ws-1"

    def test_get_nonexistent_workspace(self, executor: IsolatedExecutor) -> None:
        assert executor.get_workspace("nope") is None

    def test_list_workspaces(
        self, executor: IsolatedExecutor, git_repo: Path
    ) -> None:
        executor.create_workspace("ws-1", str(git_repo))
        executor.create_workspace("ws-2", str(git_repo))
        assert len(executor.list_workspaces()) == 2

    def test_get_changed_files(
        self, executor: IsolatedExecutor, git_repo: Path
    ) -> None:
        ws = executor.create_workspace("ws-changes", str(git_repo))

        # Make a change in the worktree
        (Path(ws.worktree_path) / "new_file.txt").write_text("hello")
        (Path(ws.worktree_path) / "README.md").write_text("# Updated\n")

        files = executor.get_changed_files("ws-changes")
        assert "new_file.txt" in files
        assert "README.md" in files

    def test_generate_patch(
        self, executor: IsolatedExecutor, git_repo: Path
    ) -> None:
        ws = executor.create_workspace("ws-patch", str(git_repo))

        (Path(ws.worktree_path) / "README.md").write_text("# Patched\n")

        patch = executor.generate_patch("ws-patch")
        assert "Patched" in patch
        assert "diff" in patch

    def test_commit_changes(
        self, executor: IsolatedExecutor, git_repo: Path
    ) -> None:
        ws = executor.create_workspace("ws-commit", str(git_repo))

        (Path(ws.worktree_path) / "new.txt").write_text("content")

        sha = executor.commit_changes("ws-commit", "Add new file")
        assert len(sha) == 40  # Full SHA

    def test_apply_patch_to_main(
        self, executor: IsolatedExecutor, git_repo: Path
    ) -> None:
        ws = executor.create_workspace("ws-apply", str(git_repo))

        (Path(ws.worktree_path) / "README.md").write_text("# Applied\n")
        executor.generate_patch("ws-apply")

        success = executor.apply_patch_to_main("ws-apply")
        assert success

        # Verify the change was applied to the main repo
        content = (git_repo / "README.md").read_text()
        assert content == "# Applied\n"

    def test_cleanup_workspace(
        self, executor: IsolatedExecutor, git_repo: Path
    ) -> None:
        ws = executor.create_workspace("ws-clean", str(git_repo))
        wt_path = Path(ws.worktree_path)
        assert wt_path.exists()

        executor.cleanup_workspace("ws-clean")
        assert executor.get_workspace("ws-clean") is None
        # Worktree directory should be cleaned up
        assert not wt_path.exists()

    def test_cleanup_all(
        self, executor: IsolatedExecutor, git_repo: Path
    ) -> None:
        executor.create_workspace("ws-a", str(git_repo))
        executor.create_workspace("ws-b", str(git_repo))
        assert len(executor.list_workspaces()) == 2

        executor.cleanup_all()
        assert len(executor.list_workspaces()) == 0
