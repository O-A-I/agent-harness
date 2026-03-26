"""Tests for the onboarding init command."""

from pathlib import Path

import pytest

from server.src.init import generate_tailored_config, init_repo


@pytest.fixture
def sample_repo(tmp_path: Path) -> Path:
    """Create a sample repo structure."""
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "index.ts").write_text("export const x = 1;")
    (tmp_path / "package.json").write_text(
        '{"dependencies": {"react": "^19.0.0"}}'
    )
    (tmp_path / "pnpm-lock.yaml").write_text("lockfileVersion: 9")
    (tmp_path / "turbo.json").write_text("{}")
    (tmp_path / "vitest.config.ts").write_text("export default {}")
    gh = tmp_path / ".github" / "workflows"
    gh.mkdir(parents=True)
    (gh / "ci.yml").write_text("name: CI")
    return tmp_path


def test_generate_tailored_config(sample_repo: Path) -> None:
    config = generate_tailored_config(str(sample_repo))
    assert config["version"] == "1"
    assert "compile" in config["verification"]["checks"]
    assert config["execution"]["isolatedExecution"] is True
    # Should detect CI and add diff-scope
    assert "diff-scope" in config["verification"]["checks"]


def test_generate_config_forbidden_paths(sample_repo: Path) -> None:
    config = generate_tailored_config(str(sample_repo))
    forbidden = config["execution"]["forbiddenPaths"]
    assert ".github/" in forbidden
    assert ".env" in forbidden


def test_init_repo(sample_repo: Path) -> None:
    path = init_repo(str(sample_repo))
    assert Path(path).exists()
    content = Path(path).read_text()
    assert "version" in content
    assert "verification" in content


def test_init_repo_already_exists(sample_repo: Path) -> None:
    init_repo(str(sample_repo))
    with pytest.raises(FileExistsError):
        init_repo(str(sample_repo))


def test_init_repo_force(sample_repo: Path) -> None:
    init_repo(str(sample_repo))
    # Should not raise with force=True
    path = init_repo(str(sample_repo), force=True)
    assert Path(path).exists()


def test_init_repo_invalid_path() -> None:
    with pytest.raises(ValueError, match="Not a directory"):
        init_repo("/nonexistent/path")


def test_init_repo_no_source_files(tmp_path: Path) -> None:
    """Should work even if repo has no detectable languages."""
    path = init_repo(str(tmp_path))
    assert Path(path).exists()
