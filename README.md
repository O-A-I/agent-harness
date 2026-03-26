# Agent Harness Core

A **deterministic orchestration shell** around probabilistic LLM agents. Routes engineering tasks to the right agent via smart applicability scoring, manages multi-phase workflows (Plan → Execute → Verify), and provides dashboards for monitoring daily engineering progress.

**Core differentiator:** Smart routing + deterministic verification, not raw intelligence.

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                    VS Code Extension                          │
│  ┌──────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │Task UX   │  │Status Bar   │  │Webview Dashboard        │  │
│  └────┬─────┘  └──────┬──────┘  └────────┬────────────────┘  │
│       └───────────┬────┘                  │                   │
│              ┌────▼─────────────────┐     │                   │
│              │  Workflow Executor   │     │                   │
│              │  (State Machine)     │     │                   │
│              └────┬─────────────────┘     │                   │
│                   │                       │                   │
│  ┌────────────────▼────┐  ┌──────────────▼──────────────┐    │
│  │  MCP Client         │  │  MCP Server                 │    │
│  │  (Tool Discovery)   │  │  (Harness Capabilities)     │    │
│  └────────────────┬────┘  └─────────────────────────────┘    │
└───────────────────┼──────────────────────────────────────────┘
                    │ HTTP (localhost)
┌───────────────────▼──────────────────────────────────────────┐
│                  Python Backend (FastAPI)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │Task Router   │  │Verification  │  │Dashboard API       │  │
│  │(Scorer)      │  │Engine        │  │(REST + WebSocket)  │  │
│  └──────────────┘  └──────────────┘  └────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │Repo Analyzer │  │Isolated Exec │  │SQLite Persistence  │  │
│  └──────────────┘  └──────────────┘  └────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**Hybrid TypeScript + Python:** TypeScript for VS Code extension, React dashboards, and MCP integration. Python for routing, verification, and the backend API.

## Quick Start

### Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 9.15
- **Python** ≥ 3.11
- **uv** (Python package manager)

### Installation

```bash
# Clone and install
git clone <repo-url> agent-harness-core
cd agent-harness-core

# TypeScript packages
pnpm install

# Python backend
cd python
uv venv
source .venv/bin/activate   # Linux/macOS
uv pip install -e ".[dev]"
cd ..
```

### Build & Test

```bash
# Build all TypeScript packages
pnpm run build

# Run all TypeScript tests (38 tests)
pnpm run test

# Run Python tests (72 tests)
cd python && source .venv/bin/activate
pytest -v

# Lint
pnpm run lint
cd python && ruff check .
```

### Initialize a Repo

```bash
# Scaffold harness.config.yaml for any repo
cd python && source .venv/bin/activate
python -m server.src.init /path/to/your/repo
```

This analyzes the repo (languages, frameworks, build system, CI) and generates a tailored config.

### Start the Backend

```bash
cd python && source .venv/bin/activate
uvicorn server.src.app:app --host 127.0.0.1 --port 8321
```

### Launch the Dashboard

```bash
cd packages/dashboard-web
pnpm run dev
# Opens at http://localhost:3000
```

## Package Structure

| Package | Description |
|---------|-------------|
| `packages/core` | Core contracts, state machine, workflow executor, TypeScript types |
| `packages/mcp-client` | MCP client SDK wrapper — connect, discover, invoke tools |
| `packages/mcp-server` | MCP server exposing harness capabilities (workflow/discover, daily/summary) |
| `packages/vscode-extension` | VS Code extension — task creation, status bar, Python bridge |
| `packages/dashboard-webview` | VS Code Webview React panel for in-editor dashboard |
| `packages/dashboard-web` | Standalone React/Vite dashboard — workflow timeline, agent heatmap |
| `python/router` | Task router — repo analyzer + applicability scorer |
| `python/evaluator` | Deterministic verification engine + isolated execution |
| `python/server` | FastAPI backend — routing API, dashboard API, persistence, onboarding |
| `schemas/` | JSON Schema for all contracts (task, workflow, routing, verification, config) |
| `configs/` | Repo-scoped harness configurations |

## Key Concepts

### Workflow Lifecycle

Every task follows a deterministic state machine:

```
Created → Planning → Planned → Executing → Executed → Verifying → Verified → Done
   ↓          ↓         ↓          ↓           ↓           ↓          ↓
 Failed    Failed    Failed     Failed      Failed      Failed     Failed
```

### Task Routing

The router scores each agent (0.0–1.0) using deterministic heuristics:

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Task type match | 35% | Agent supports the task type (bug-fix, feature, etc.) |
| Language overlap | 30% | Agent's languages match the repo's languages |
| Framework overlap | 20% | Agent knows the repo's frameworks (React, FastAPI, etc.) |
| Tool coverage | 15% | Number of available tools (diminishing returns) |

### Verification Engine

Deterministic post-execution checks — no LLM involved:

- **Compile** — runs the project build
- **Type-check** — static type analysis
- **Test** — runs the test suite
- **Lint** — code style and quality
- **Diff-scope** — ensures changes stay within allowed file boundaries
- **Custom** — user-defined shell commands

### Isolated Execution

Agent actions run in isolated git worktrees. Changes are staged as patches that can be reviewed before merging back to the main working tree.

### Persistence & Export

All workflow data is stored in SQLite (`~/.harness/harness.db`). Full JSON export/import for portability:

```bash
# Export via API
curl -X POST http://localhost:8321/api/export > backup.json

# Import via API
curl -X POST http://localhost:8321/api/import \
  -H "Content-Type: application/json" \
  -d '{"data": <backup-json>}'
```

## Dashboard API

The backend exposes REST + WebSocket endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/route` | POST | Route a task to the best agent |
| `/analyze` | POST | Analyze a repository |
| `/api/workflows` | GET | List workflows (optional `?phase=` filter) |
| `/api/workflows/{id}` | GET | Get workflow with transitions and results |
| `/api/stats/agents` | GET | Agent performance stats |
| `/api/stats/verification` | GET | Verification pass rates |
| `/api/progress` | GET | Daily progress (`?date=` or `?start_date=&end_date=`) |
| `/api/export` | POST | Export all data as JSON |
| `/api/import` | POST | Import data from JSON |
| `/ws/live` | WebSocket | Live workflow update stream |

## `harness.config.yaml`

Each repo can have a `harness.config.yaml` to customize behavior:

```yaml
version: "1"
agents:
  allowed: []          # Empty = allow all
  blocked: []
verification:
  checks:
    - compile
    - typecheck
    - test
    - lint
    - diff-scope
  customCommands:
    - name: security-audit
      command: npm audit --production
      timeout: 60
execution:
  maxFileChanges: 20
  forbiddenPaths:
    - .github/
    - .env
    - pnpm-lock.yaml
  timeoutMs: 300000
  isolatedExecution: true
routing:
  overrides: []
```

## Development

### Monorepo Structure

- **pnpm workspaces** for TypeScript packages
- **uv** for Python dependency management
- **turborepo** for build orchestration
- **vitest** for TypeScript testing
- **pytest** for Python testing

### Scripts

```bash
pnpm run build      # Build all TS packages
pnpm run test       # Run all TS tests
pnpm run lint       # Lint all TS packages
pnpm run typecheck  # Type-check all TS packages
pnpm run clean      # Clean build artifacts
```

### CI/CD

GitHub Actions runs on every push/PR:
- TypeScript: lint → typecheck → test (Node 22)
- Python: ruff → mypy → pytest (Python 3.11)

## Test Coverage

| Module | Tests | Coverage |
|--------|-------|----------|
| Core state machine | 14 | All transitions, events, serialization |
| Core workflow executor | 8 | Full lifecycle, failure, cancel, multi-workflow |
| Core workflow E2E | 4 | Plan→Execute→Verify→Done, failure, concurrent, invalid transitions |
| MCP client tool registry | 10 | Register, query, filter, bulk, clear |
| MCP server unit | 6 | Construction, deps contract |
| MCP server integration | 6 | Full workflow data, transitions, progress |
| Python repo analyzer | 7 | Language/framework/build/test/CI/pkg detection |
| Python applicability scorer | 5 | Perfect match, mismatch, partial, generic |
| Python task router | 5 | Best agent, fallback, no agents, single agent |
| Python verification engine | 7 | Success, failure, timeout, custom commands |
| Python isolated execution | 11 | Worktree create/cleanup, patch, commit, apply |
| Python persistence | 19 | CRUD, stats, progress, export/import roundtrip |
| Python dashboard API | 11 | All endpoints, filter, roundtrip |
| Python onboarding init | 7 | Config generation, init, force, edge cases |
| Python bridge integration | 5 | Full /route roundtrip, agent selection, /analyze, error cases |
| **Total** | **125** | |

## License

Private — internal use only.
