# Agent Harness

A deterministic orchestration shell for LLM-powered engineering agents.

Agent Harness routes tasks to the right agent via MCP, manages multi-phase workflows (Plan → Execute → Verify), and provides deterministic verification of agent outputs. The LLM lives inside the agents — the harness is the deterministic shell around them.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Agent Harness                         │
│                                                         │
│  Task → Router → Agent (via MCP) → Verification → Done │
│         ↑                                    ↓          │
│    Repo Context                         State Machine   │
│    Analyzer                          (FSM lifecycle)    │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │  @core   │  │   @mcp   │  │      @router         │  │
│  │Contracts │  │ Client   │  │ Repo Analyzer        │  │
│  │  FSM     │  │ Server   │  │ Applicability Scorer │  │
│  │ Config   │  │ Registry │  │ Task Router          │  │
│  │  Store   │  │          │  │                      │  │
│  └──────────┘  └──────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Packages

| Package | Description |
|---|---|
| `@agent-harness/core` | Contracts (types), workflow state machine, config loader, persistence interface |
| `@agent-harness/mcp` | MCP client wrapper, harness MCP server, tool registry |
| `@agent-harness/router` | Repo context analyzer, applicability scorer, task router |

## Quick Start

```bash
# Prerequisites: Node.js >= 20, pnpm >= 9

# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Run the end-to-end demo
pnpm run demo

# Run tests
pnpm run test
```

## Demo

Run `pnpm run demo` to see the full harness in action. The demo walks through the complete lifecycle:

### 1. Agent Registration

Three agents are registered in the tool registry with their capabilities (languages, frameworks, task types, MCP tools):

```
🔧 Registered 3 agents in tool registry
   Tools indexed: 3
```

### 2. Task Creation & Routing

A task ("Fix login button crash on Safari") is created and routed. The router analyzes the repo, detects it's a TypeScript project, and scores all agents:

```
📈 Agent Scores:
   █████████████████░░░ 83% — ts-fullstack
   █████████░░░░░░░░░░░ 43% — python-backend
   ██████░░░░░░░░░░░░░░ 28% — docs-agent

✅ Routing Decision:
   Agent: ts-fullstack
   Confidence: 83%
   Reasoning: Strong language match (typescript); Task type alignment
   Fallbacks: [python-backend, docs-agent]
```

### 3. Workflow State Machine

The workflow walks through the full deterministic lifecycle — every transition is logged:

```
🔄 Walking workflow state machine:

   created → planning (Agent generating plan)
   planning → planned (Plan approved)
   planned → executing (Starting code changes)
   executing → executed (Changes applied)
   executed → verifying (Running verification checks)
   verifying → verified (All checks passed)
   verified → done (Workflow complete)
```

### 4. Persistence & MCP Tool Queries

The completed workflow is persisted to the store, then queried using the same MCP tool interface that external agents would use:

```
💾 Persisting to store and querying via MCP tools:

   workflow/discover → 1 workflow(s) found
   workflow/status → phase: done
   workflow/events → 7 events
   daily/summary → 1/1 tasks completed
```

### 5. Failure & Retry

A second workflow demonstrates the failure + retry path — the agent hits a rate limit, the workflow transitions to `failed`, then retries and completes successfully:

```
🔁 Demo: failure and retry flow:

   created → planning (Starting)
   planned → executing (Agent working)
   executing → failed (Agent hit rate limit)
   failed → executing (Retrying with backoff)
   executing → executed (Success on retry)
   verified → done (Completed after retry)
```

## Usage

### As a Library

Install the packages and use them in your own code:

```typescript
import { WorkflowStateMachine, taskId, agentId, WorkflowPhase } from '@agent-harness/core';
import type { Task, AgentCapability } from '@agent-harness/core';
import { routeTask } from '@agent-harness/router';

// 1. Define a task
const task: Task = {
  id: taskId('task-001'),
  title: 'Fix login button crash',
  description: 'TypeError on Safari 17',
  source: { type: 'manual', createdBy: 'you' },
  repoContext: {
    rootPath: '/path/to/your/repo',
    languages: ['typescript'],
    frameworks: ['react'],
  },
  createdAt: new Date(),
  metadata: {},
};

// 2. Define agents with their capabilities
const agents: AgentCapability[] = [{
  agentId: agentId('my-agent'),
  name: 'My Agent',
  description: 'Handles TS tasks',
  languages: ['typescript'],
  frameworks: ['react'],
  taskTypes: ['bugfix'],
  mcpTools: [],
}];

// 3. Route the task — analyzes repo, scores agents, picks the best one
const result = await routeTask(task, agents);
console.log(result.decision.agentId);    // 'my-agent'
console.log(result.decision.confidence); // 0.83

// 4. Create and drive the workflow state machine
const machine = new WorkflowStateMachine(task.id);
machine.onTransition((event) => {
  console.log(`${event.fromPhase} → ${event.toPhase}`);
});

machine.transition(WorkflowPhase.Planning);
machine.transition(WorkflowPhase.Planned);
machine.transition(WorkflowPhase.Executing);
// ... drive through phases as your agent works
```

### Analyzing Any Repo

Point the analyzer at any repo on your machine:

```typescript
import { analyzeRepo } from '@agent-harness/router';

const profile = await analyzeRepo('/path/to/any/repo');
console.log(profile.languages);      // [{ name: 'typescript', percentage: 80, fileCount: 200 }]
console.log(profile.frameworks);     // ['react', 'next.js']
console.log(profile.packageManager); // 'pnpm'
console.log(profile.testFramework);  // 'vitest'
```

### Querying via MCP Tools

Use the harness MCP server to query workflow state programmatically:

```typescript
import { HarnessToolHandler, InMemoryWorkflowStore } from '@agent-harness/core';

const store = new InMemoryWorkflowStore();
await store.initialize();
// ... save tasks and workflows to store

const handler = new HarnessToolHandler(store);

// These are the same tools exposed via MCP protocol
const workflows = await handler.handle('workflow/discover', { limit: 10 });
const status = await handler.handle('workflow/status', { workflowId: 'wf-1' });
const progress = await handler.handle('daily/summary', { date: '2026-03-25' });
```

### Repo Configuration

Add a `harness.config.yaml` to any repo to control behavior:

```yaml
version: 1
agents:
  allowed: [ts-agent, py-agent]   # restrict which agents can work on this repo
  default: ts-agent                # fallback when routing is ambiguous
verification:
  checks:
    - type: compile
      enabled: true
    - type: type-check
      enabled: true
    - type: lint
      enabled: true
    - type: test
      enabled: true
    - type: git-diff-scope
      enabled: true
  parallelism: 4
constraints:
  maxFileChanges: 50
  forbiddenPaths: ["node_modules/**", ".git/**", ".env*"]
  timeout: 300000  # 5 minutes
```

If no config file exists, sensible defaults are used automatically.

## Key Concepts

### Workflow Lifecycle (State Machine)

Every task follows a deterministic state machine:

```
Created → Planning → Planned → Executing → Executed → Verifying → Verified → Done
                                                                              ↗
Any phase (except Done) ─────────────────────────────────────────────→ Failed
```

Retry paths: `Failed → Planning` (re-plan) or `Failed → Executing` (re-execute).

Every transition is logged as an event, persisted to the store.

### Task Routing

The router analyzes a repo's context (languages, frameworks, build system) and scores registered agents using deterministic heuristics:

1. **Repo Context Analyzer** — detects languages, frameworks, test framework, CI config, package manager from file structure
2. **Applicability Scorer** — scores each agent (0-1) across dimensions: language match (40%), framework match (25%), task type match (25%), tool availability (10%)
3. **Task Router** — selects the highest-scoring agent with fallback chain

### MCP Integration

Agent Harness is MCP-native:

- **As MCP Client**: Connects to external MCP servers, discovers tools/resources, invokes agent capabilities
- **As MCP Server**: Exposes harness capabilities (`workflow/discover`, `workflow/status`, `workflow/events`, `daily/summary`) so other tools can query workflow state

## Project Status

**Phase 1: Foundation** — Core contracts, state machine, config, store, MCP interfaces, and router with deterministic heuristics. This is the current state.

### Roadmap

- **Phase 2**: Real MCP SDK integration (`@modelcontextprotocol/sdk`)
- **Phase 3**: Verification engine (compile, type-check, lint, test pass, git diff scope)
- **Phase 4**: Workflow executor (orchestrates Plan→Execute→Verify per task)
- **Phase 5**: SQLite persistence
- **Phase 6**: VS Code extension integration

## Contributing

We welcome contributions! Please ensure:

1. All tests pass: `pnpm run test`
2. Types check: `pnpm run typecheck`
3. Code is formatted: `pnpm run format`
4. Linting passes: `pnpm run lint`

## License

Apache-2.0
