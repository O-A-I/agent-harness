"""Harness init — CLI command to scaffold harness.config.yaml in a repo.

Usage:
    python -m server.src.init [repo_path]

Analyzes the repo, generates a tailored config, and writes it.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from router.src.analyzer import analyze_repo
from server.src.config import generate_default_config

import yaml  # type: ignore[import-untyped]


BANNER = """
╔══════════════════════════════════════════╗
║       Agent Harness — Init               ║
╚══════════════════════════════════════════╝
"""


def generate_tailored_config(repo_path: str) -> dict:  # type: ignore[type-arg]
    """Generate a harness.config.yaml tailored to the detected repo profile."""
    try:
        profile = analyze_repo(repo_path)
    except ValueError:
        return yaml.safe_load(generate_default_config(repo_path))

    config: dict = {  # type: ignore[type-arg]
        "version": "1",
        "agents": {"allowed": [], "blocked": []},
        "verification": {
            "checks": ["compile", "typecheck", "test", "lint"],
            "customCommands": [],
        },
        "execution": {
            "maxFileChanges": 20,
            "forbiddenPaths": _default_forbidden(profile),
            "timeoutMs": 300000,
            "isolatedExecution": True,
        },
        "routing": {"overrides": []},
    }

    # Add diff-scope check if we detected a CI system
    if profile.ci_config:
        config["verification"]["checks"].append("diff-scope")

    return config


def _default_forbidden(profile) -> list:  # type: ignore[type-arg]
    """Generate sensible forbidden paths based on repo profile."""
    forbidden = [".github/", ".gitlab-ci.yml", "LICENSE", ".env"]

    if profile.package_manager in ("pnpm", "npm", "yarn"):
        forbidden.append("pnpm-lock.yaml")
        forbidden.append("package-lock.json")
        forbidden.append("yarn.lock")
    if profile.package_manager in ("uv", "poetry", "pipenv"):
        forbidden.append("uv.lock")
        forbidden.append("poetry.lock")
        forbidden.append("Pipfile.lock")

    return forbidden


def init_repo(repo_path: str, force: bool = False) -> str:
    """Initialize harness.config.yaml in the given repo.

    Returns the path to the created config file.
    """
    root = Path(repo_path).resolve()
    if not root.is_dir():
        raise ValueError(f"Not a directory: {repo_path}")

    config_path = root / "harness.config.yaml"
    if config_path.exists() and not force:
        raise FileExistsError(
            f"Config already exists: {config_path}\n"
            "Use --force to overwrite."
        )

    config = generate_tailored_config(str(root))
    config_yaml = yaml.dump(config, default_flow_style=False, sort_keys=False)

    config_path.write_text(config_yaml)
    return str(config_path)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Initialize Agent Harness config for a repository",
    )
    parser.add_argument(
        "repo_path",
        nargs="?",
        default=".",
        help="Path to the repository (default: current directory)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing harness.config.yaml",
    )
    args = parser.parse_args(argv)

    print(BANNER)

    try:
        path = init_repo(args.repo_path, force=args.force)
        print(f"✅ Created {path}")

        # Show detected profile
        try:
            profile = analyze_repo(args.repo_path)
            print(f"\n📊 Detected repo profile:")
            print(f"   Languages:      {', '.join(l.name for l in profile.languages)}")
            print(f"   Frameworks:     {', '.join(profile.frameworks) or 'none detected'}")
            print(f"   Build system:   {profile.build_system or 'none detected'}")
            print(f"   Test framework: {profile.test_framework or 'none detected'}")
            print(f"   Package mgr:    {profile.package_manager or 'none detected'}")
            print(f"   CI:             {profile.ci_config or 'none detected'}")
        except ValueError:
            pass

        print("\n🚀 Next steps:")
        print("   1. Review and customize harness.config.yaml")
        print("   2. Open the repo in VS Code with Agent Harness extension")
        print("   3. Create your first task: Cmd+Shift+P → 'Harness: New Task'")
        return 0

    except FileExistsError as e:
        print(f"⚠️  {e}", file=sys.stderr)
        return 1
    except ValueError as e:
        print(f"❌ {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
