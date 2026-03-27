"""Tests for the repo context analyzer."""

from pathlib import Path

import pytest

from router.src.analyzer import analyze_repo


@pytest.fixture
def sample_repo(tmp_path: Path) -> Path:
    """Create a sample repo structure for testing."""
    # TypeScript files
    src = tmp_path / "src"
    src.mkdir()
    (src / "index.ts").write_text("export const x = 1;")
    (src / "app.tsx").write_text("export default function App() {}")
    (src / "utils.ts").write_text("export function util() {}")

    # Python file
    (tmp_path / "script.py").write_text("print('hello')")

    # package.json with React
    (tmp_path / "package.json").write_text(
        '{"dependencies": {"react": "^19.0.0"}, "devDependencies": {"vitest": "^3.0.0"}}'
    )

    # pnpm
    (tmp_path / "pnpm-lock.yaml").write_text("lockfileVersion: 9")

    # Turbo
    (tmp_path / "turbo.json").write_text("{}")

    # Vitest config
    (tmp_path / "vitest.config.ts").write_text("export default {}")

    # GitHub Actions
    gh = tmp_path / ".github" / "workflows"
    gh.mkdir(parents=True)
    (gh / "ci.yml").write_text("name: CI")

    return tmp_path


def test_analyze_detects_languages(sample_repo: Path) -> None:
    profile = analyze_repo(str(sample_repo))
    lang_names = [lang.name for lang in profile.languages]
    assert "typescript" in lang_names
    assert "python" in lang_names


def test_analyze_detects_frameworks(sample_repo: Path) -> None:
    profile = analyze_repo(str(sample_repo))
    assert "react" in profile.frameworks


def test_analyze_detects_build_system(sample_repo: Path) -> None:
    profile = analyze_repo(str(sample_repo))
    assert profile.build_system == "turborepo"


def test_analyze_detects_test_framework(sample_repo: Path) -> None:
    profile = analyze_repo(str(sample_repo))
    assert profile.test_framework == "vitest"


def test_analyze_detects_ci(sample_repo: Path) -> None:
    profile = analyze_repo(str(sample_repo))
    assert profile.ci_config == "github-actions"


def test_analyze_detects_package_manager(sample_repo: Path) -> None:
    profile = analyze_repo(str(sample_repo))
    assert profile.package_manager == "pnpm"


def test_analyze_invalid_path() -> None:
    with pytest.raises(ValueError, match="Not a directory"):
        analyze_repo("/nonexistent/path")
