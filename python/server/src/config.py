"""Repo-scoped config — loads and validates harness.config.yaml."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml  # type: ignore[import-untyped]

DEFAULT_CONFIG: dict[str, Any] = {
    "version": "1",
    "agents": {"allowed": [], "blocked": []},
    "verification": {
        "checks": ["compile", "typecheck", "test", "lint"],
        "customCommands": [],
    },
    "execution": {
        "maxFileChanges": 20,
        "forbiddenPaths": [],
        "timeoutMs": 300000,
    },
    "routing": {"overrides": []},
}


def load_config(repo_path: str) -> dict[str, Any]:
    """Load harness.config.yaml from a repo, merging with defaults."""
    config_path = Path(repo_path) / "harness.config.yaml"

    if not config_path.exists():
        config_path = Path(repo_path) / "harness.config.yml"

    if not config_path.exists():
        return dict(DEFAULT_CONFIG)

    with open(config_path) as f:
        user_config = yaml.safe_load(f) or {}

    return _deep_merge(DEFAULT_CONFIG, user_config)


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    """Deep merge two dicts, with override taking precedence."""
    result = dict(base)
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def generate_default_config(repo_path: str) -> str:
    """Generate a default harness.config.yaml as a string."""
    result: str = yaml.dump(DEFAULT_CONFIG, default_flow_style=False, sort_keys=False)
    return result
