"""Isolated execution — run agent actions in separate git worktrees.

Provides sandboxed directories for agent file changes, then stages
results as patches that can be reviewed before merging.
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class IsolatedWorkspace:
    """A sandboxed workspace for agent execution."""

    workspace_id: str
    source_repo: str
    worktree_path: str
    branch: str
    is_active: bool = True
    files_changed: list[str] = field(default_factory=list)
    patch: str | None = None


class IsolatedExecutor:
    """Manages isolated git worktrees for safe agent execution.

    Each workflow gets its own worktree branch so agent changes
    don't affect the main working tree until explicitly merged.
    """

    def __init__(self, base_dir: str | None = None):
        self.base_dir = Path(base_dir) if base_dir else Path(tempfile.mkdtemp(prefix="harness-"))
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self._workspaces: dict[str, IsolatedWorkspace] = {}

    def create_workspace(
        self,
        workspace_id: str,
        repo_path: str,
        base_branch: str = "HEAD",
    ) -> IsolatedWorkspace:
        """Create an isolated worktree for agent execution.

        Creates a new git worktree on a temporary branch derived from base_branch.
        """
        repo = Path(repo_path).resolve()
        if not (repo / ".git").exists():
            raise ValueError(f"Not a git repository: {repo_path}")

        worktree_dir = self.base_dir / workspace_id
        branch_name = f"harness/{workspace_id}"

        # Create a new branch for the worktree
        subprocess.run(
            ["git", "branch", branch_name, base_branch],
            cwd=str(repo),
            capture_output=True,
            text=True,
            check=True,
        )

        # Create the worktree
        subprocess.run(
            ["git", "worktree", "add", str(worktree_dir), branch_name],
            cwd=str(repo),
            capture_output=True,
            text=True,
            check=True,
        )

        workspace = IsolatedWorkspace(
            workspace_id=workspace_id,
            source_repo=str(repo),
            worktree_path=str(worktree_dir),
            branch=branch_name,
        )
        self._workspaces[workspace_id] = workspace
        return workspace

    def get_workspace(self, workspace_id: str) -> IsolatedWorkspace | None:
        return self._workspaces.get(workspace_id)

    def list_workspaces(self) -> list[IsolatedWorkspace]:
        return list(self._workspaces.values())

    def get_changed_files(self, workspace_id: str) -> list[str]:
        """Get list of files changed in the workspace."""
        ws = self._workspaces.get(workspace_id)
        if not ws:
            raise ValueError(f"Workspace '{workspace_id}' not found")

        result = subprocess.run(
            ["git", "diff", "--name-only", "HEAD"],
            cwd=ws.worktree_path,
            capture_output=True,
            text=True,
        )
        files = [f for f in result.stdout.strip().split("\n") if f]

        # Also include untracked files
        untracked = subprocess.run(
            ["git", "ls-files", "--others", "--exclude-standard"],
            cwd=ws.worktree_path,
            capture_output=True,
            text=True,
        )
        files.extend(f for f in untracked.stdout.strip().split("\n") if f)

        ws.files_changed = files
        return files

    def generate_patch(self, workspace_id: str) -> str:
        """Generate a unified diff patch from the workspace changes."""
        ws = self._workspaces.get(workspace_id)
        if not ws:
            raise ValueError(f"Workspace '{workspace_id}' not found")

        # Stage all changes
        subprocess.run(
            ["git", "add", "-A"],
            cwd=ws.worktree_path,
            capture_output=True,
            check=True,
        )

        # Generate patch from staged changes
        result = subprocess.run(
            ["git", "diff", "--cached"],
            cwd=ws.worktree_path,
            capture_output=True,
            text=True,
        )
        ws.patch = result.stdout
        return result.stdout

    def commit_changes(
        self, workspace_id: str, message: str
    ) -> str:
        """Commit all changes in the workspace. Returns the commit SHA."""
        ws = self._workspaces.get(workspace_id)
        if not ws:
            raise ValueError(f"Workspace '{workspace_id}' not found")

        subprocess.run(
            ["git", "add", "-A"],
            cwd=ws.worktree_path,
            capture_output=True,
            check=True,
        )

        subprocess.run(
            ["git", "commit", "-m", message],
            cwd=ws.worktree_path,
            capture_output=True,
            text=True,
            check=True,
        )

        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=ws.worktree_path,
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()

    def apply_patch_to_main(self, workspace_id: str) -> bool:
        """Apply the workspace patch to the main repo working directory."""
        ws = self._workspaces.get(workspace_id)
        if not ws:
            raise ValueError(f"Workspace '{workspace_id}' not found")

        patch = ws.patch or self.generate_patch(workspace_id)
        if not patch.strip():
            return True  # Nothing to apply

        result = subprocess.run(
            ["git", "apply", "--check", "-"],
            cwd=ws.source_repo,
            input=patch,
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            return False

        subprocess.run(
            ["git", "apply", "-"],
            cwd=ws.source_repo,
            input=patch,
            capture_output=True,
            text=True,
            check=True,
        )
        return True

    def cleanup_workspace(self, workspace_id: str) -> None:
        """Remove the worktree and its branch."""
        ws = self._workspaces.get(workspace_id)
        if not ws:
            return

        ws.is_active = False

        # Remove worktree
        subprocess.run(
            ["git", "worktree", "remove", ws.worktree_path, "--force"],
            cwd=ws.source_repo,
            capture_output=True,
        )

        # Delete the branch
        subprocess.run(
            ["git", "branch", "-D", ws.branch],
            cwd=ws.source_repo,
            capture_output=True,
        )

        # Clean up directory if still exists
        wt_path = Path(ws.worktree_path)
        if wt_path.exists():
            shutil.rmtree(wt_path, ignore_errors=True)

        del self._workspaces[workspace_id]

    def cleanup_all(self) -> None:
        """Remove all workspaces."""
        for ws_id in list(self._workspaces.keys()):
            self.cleanup_workspace(ws_id)
