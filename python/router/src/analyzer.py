"""Repo context analyzer — detects languages, frameworks, build system, etc."""

from __future__ import annotations

import json
import os
from collections import Counter
from datetime import datetime
from pathlib import Path

from .models import RepoProfile, LanguageInfo

# File extension → language mapping
EXTENSION_MAP: dict[str, str] = {
    ".py": "python",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".rs": "rust",
    ".go": "go",
    ".java": "java",
    ".kt": "kotlin",
    ".cs": "csharp",
    ".cpp": "cpp",
    ".c": "c",
    ".rb": "ruby",
    ".php": "php",
    ".swift": "swift",
    ".scala": "scala",
}

# Framework detection patterns: (file_or_dir, framework_name)
FRAMEWORK_SIGNALS: list[tuple[str, str]] = [
    ("package.json", "_check_package_json"),
    ("requirements.txt", "_check_requirements"),
    ("pyproject.toml", "_check_pyproject"),
    ("Cargo.toml", "rust"),
    ("go.mod", "go"),
    ("angular.json", "angular"),
    ("next.config.js", "nextjs"),
    ("next.config.ts", "nextjs"),
    ("nuxt.config.ts", "nuxt"),
    ("svelte.config.js", "svelte"),
    ("tailwind.config.js", "tailwind"),
    ("tailwind.config.ts", "tailwind"),
]

BUILD_SYSTEM_FILES: dict[str, str] = {
    "Makefile": "make",
    "CMakeLists.txt": "cmake",
    "build.gradle": "gradle",
    "build.gradle.kts": "gradle",
    "pom.xml": "maven",
    "meson.build": "meson",
    "BUILD": "bazel",
    "WORKSPACE": "bazel",
    "turbo.json": "turborepo",
}

TEST_FRAMEWORK_FILES: dict[str, str] = {
    "jest.config.js": "jest",
    "jest.config.ts": "jest",
    "vitest.config.ts": "vitest",
    "vitest.config.js": "vitest",
    "pytest.ini": "pytest",
    "conftest.py": "pytest",
    ".mocharc.yml": "mocha",
    "karma.conf.js": "karma",
}

CI_CONFIG_FILES: dict[str, str] = {
    ".github/workflows": "github-actions",
    ".gitlab-ci.yml": "gitlab-ci",
    "Jenkinsfile": "jenkins",
    ".circleci/config.yml": "circleci",
    "azure-pipelines.yml": "azure-pipelines",
    ".travis.yml": "travis",
}

PACKAGE_MANAGER_FILES: dict[str, str] = {
    "pnpm-lock.yaml": "pnpm",
    "pnpm-workspace.yaml": "pnpm",
    "yarn.lock": "yarn",
    "package-lock.json": "npm",
    "Pipfile.lock": "pipenv",
    "poetry.lock": "poetry",
    "uv.lock": "uv",
    "Cargo.lock": "cargo",
    "go.sum": "go",
}

SKIP_DIRS = {
    "node_modules", ".git", "dist", "build", "__pycache__",
    ".venv", "venv", ".tox", "target", ".next", "coverage",
}


def analyze_repo(repo_path: str, max_files: int = 5000) -> RepoProfile:
    """Analyze a repository and produce a RepoProfile."""
    root = Path(repo_path).resolve()
    if not root.is_dir():
        raise ValueError(f"Not a directory: {repo_path}")

    # Count file extensions
    ext_counter: Counter[str] = Counter()
    file_count = 0

    for dirpath, dirnames, filenames in os.walk(root):
        # Prune skippable dirs
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]

        for fname in filenames:
            ext = Path(fname).suffix.lower()
            if ext in EXTENSION_MAP:
                ext_counter[ext] += 1
                file_count += 1

            if file_count >= max_files:
                break
        if file_count >= max_files:
            break

    # Compute language percentages
    total = sum(ext_counter.values()) or 1
    lang_counts: Counter[str] = Counter()
    for ext, count in ext_counter.items():
        lang = EXTENSION_MAP[ext]
        lang_counts[lang] += count

    languages = [
        LanguageInfo(name=lang, percentage=round(count / total * 100, 1))
        for lang, count in lang_counts.most_common()
    ]

    # Detect frameworks
    frameworks = _detect_frameworks(root)

    # Detect build system
    build_system = _detect_first(root, BUILD_SYSTEM_FILES)

    # Detect test framework
    test_framework = _detect_first(root, TEST_FRAMEWORK_FILES)

    # Detect CI
    ci_config = _detect_first(root, CI_CONFIG_FILES)

    # Detect package manager
    package_manager = _detect_first(root, PACKAGE_MANAGER_FILES)

    return RepoProfile(
        path=str(root),
        languages=languages,
        frameworks=frameworks,
        build_system=build_system,
        test_framework=test_framework,
        ci_config=ci_config,
        package_manager=package_manager,
        analyzed_at=datetime.now(),
    )


def _detect_first(root: Path, file_map: dict[str, str]) -> str | None:
    for file_pattern, value in file_map.items():
        if (root / file_pattern).exists():
            return value
    return None


def _detect_frameworks(root: Path) -> list[str]:
    frameworks: set[str] = set()

    for file_pattern, value in FRAMEWORK_SIGNALS:
        path = root / file_pattern
        if not path.exists():
            continue

        if value == "_check_package_json":
            frameworks.update(_check_package_json(path))
        elif value == "_check_requirements":
            frameworks.update(_check_requirements(path))
        elif value == "_check_pyproject":
            frameworks.update(_check_pyproject(path))
        else:
            frameworks.add(value)

    return sorted(frameworks)


def _check_package_json(path: Path) -> list[str]:
    """Extract framework signals from package.json dependencies."""
    frameworks: list[str] = []
    try:
        data = json.loads(path.read_text())
        all_deps = {
            **data.get("dependencies", {}),
            **data.get("devDependencies", {}),
        }
        dep_framework_map = {
            "react": "react",
            "vue": "vue",
            "svelte": "svelte",
            "@angular/core": "angular",
            "next": "nextjs",
            "express": "express",
            "fastify": "fastify",
            "nestjs": "nestjs",
            "@nestjs/core": "nestjs",
            "electron": "electron",
        }
        for dep, fw in dep_framework_map.items():
            if dep in all_deps:
                frameworks.append(fw)
    except (json.JSONDecodeError, OSError):
        pass
    return frameworks


def _check_requirements(path: Path) -> list[str]:
    """Extract framework signals from requirements.txt."""
    frameworks: list[str] = []
    try:
        content = path.read_text().lower()
        req_framework_map = {
            "django": "django",
            "flask": "flask",
            "fastapi": "fastapi",
            "pytorch": "pytorch",
            "torch": "pytorch",
            "tensorflow": "tensorflow",
            "numpy": "numpy",
            "pandas": "pandas",
        }
        for req, fw in req_framework_map.items():
            if req in content:
                frameworks.append(fw)
    except OSError:
        pass
    return frameworks


def _check_pyproject(path: Path) -> list[str]:
    """Extract framework signals from pyproject.toml."""
    frameworks: list[str] = []
    try:
        content = path.read_text().lower()
        if "django" in content:
            frameworks.append("django")
        if "flask" in content:
            frameworks.append("flask")
        if "fastapi" in content:
            frameworks.append("fastapi")
        if "torch" in content:
            frameworks.append("pytorch")
    except OSError:
        pass
    return frameworks
