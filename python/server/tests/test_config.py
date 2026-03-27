"""Tests for the repo-scoped config loader."""

from pathlib import Path

from server.src.config import _deep_merge, generate_default_config, load_config


def test_load_config_no_file(tmp_path: Path) -> None:
    """Returns defaults when no config file exists."""
    config = load_config(str(tmp_path))
    assert config["version"] == "1"
    assert "compile" in config["verification"]["checks"]


def test_load_config_with_yaml(tmp_path: Path) -> None:
    """Merges user config with defaults."""
    config_content = """
version: "1"
agents:
  allowed:
    - copilot-agent
verification:
  checks:
    - compile
    - test
"""
    (tmp_path / "harness.config.yaml").write_text(config_content)
    config = load_config(str(tmp_path))
    assert config["agents"]["allowed"] == ["copilot-agent"]
    assert config["verification"]["checks"] == ["compile", "test"]
    # Defaults should still be present for unspecified keys
    assert "execution" in config


def test_load_config_yml_extension(tmp_path: Path) -> None:
    """Supports .yml extension."""
    (tmp_path / "harness.config.yml").write_text("version: '1'\n")
    config = load_config(str(tmp_path))
    assert config["version"] == "1"


def test_generate_default_config(tmp_path: Path) -> None:
    output = generate_default_config(str(tmp_path))
    assert "version" in output
    assert "verification" in output
    assert "execution" in output


def test_deep_merge_basic() -> None:
    base = {"a": 1, "b": {"c": 2, "d": 3}}
    override = {"b": {"c": 99}, "e": 5}
    result = _deep_merge(base, override)
    assert result["a"] == 1
    assert result["b"]["c"] == 99
    assert result["b"]["d"] == 3
    assert result["e"] == 5


def test_deep_merge_override_non_dict() -> None:
    base = {"a": {"b": 1}}
    override = {"a": "replaced"}
    result = _deep_merge(base, override)
    assert result["a"] == "replaced"
