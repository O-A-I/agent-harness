// Run with: node playground/demo.mjs
// Requires: pnpm run build (to generate dist/)

import { WorkflowStateMachine, taskId, agentId, WorkflowPhase, InMemoryWorkflowStore } from '@agent-harness/core';
import { routeTask } from '@agent-harness/router';
import { ToolRegistry, HarnessToolHandler } from '@agent-harness/mcp';

// ─── 1. Define some agents ────────────────────────────────────

const agents = [
  {
    agentId: agentId('ts-fullstack'),
    name: 'TypeScript Fullstack Agent',
    description: 'Handles TypeScript/React/Node.js tasks',
    languages: ['typescript', 'javascript'],
    frameworks: ['react', 'next.js', 'express', 'node'],
    taskTypes: ['bugfix', 'feature', 'refactor', 'test'],
    mcpTools: ['edit-file', 'run-tests', 'lint'],
  },
  {
    agentId: agentId('python-backend'),
    name: 'Python Backend Agent',
    description: 'Handles Python/Django/FastAPI tasks',
    languages: ['python'],
    frameworks: ['django', 'fastapi', 'flask'],
    taskTypes: ['bugfix', 'feature', 'refactor'],
    mcpTools: ['edit-file', 'run-tests'],
  },
  {
    agentId: agentId('docs-agent'),
    name: 'Documentation Agent',
    description: 'Writes and updates documentation',
    languages: ['markdown'],
    frameworks: [],
    taskTypes: ['docs', 'readme'],
    mcpTools: ['edit-file'],
  },
];

// ─── 2. Register tools in the registry ────────────────────────

const registry = new ToolRegistry();

const tsMockTools = [
  { name: 'edit-file', description: 'Edit a file', inputSchema: {}, serverName: 'ts-server' },
  { name: 'run-tests', description: 'Run test suite', inputSchema: {}, serverName: 'ts-server' },
  { name: 'lint', description: 'Lint code', inputSchema: {}, serverName: 'ts-server' },
];

registry.registerAgent(agents[0], tsMockTools);
registry.registerAgent(agents[1], []);
registry.registerAgent(agents[2], []);

console.log(`\n🔧 Registered ${registry.getAgentIds().length} agents in tool registry`);
console.log(`   Tools indexed: ${registry.getAllEntries().length}\n`);

// ─── 3. Create a task and route it ───────────────────────────

const task = {
  id: taskId('task-001'),
  title: 'Fix login button crash on Safari',
  description: 'Users report the login button throws a TypeError on Safari 17. The onClick handler references a null ref.',
  source: { type: 'manual', createdBy: 'demo' },
  repoContext: {
    rootPath: process.cwd(),
    languages: ['typescript'],
    frameworks: ['react'],
  },
  createdAt: new Date(),
  metadata: { priority: 'high' },
};

console.log(`📋 Task: "${task.title}"`);
console.log(`   Source: ${task.source.type}`);
console.log(`   Repo: ${task.repoContext.rootPath}\n`);

// Route the task
console.log('🔍 Analyzing repo and routing task...\n');
const routerResult = await routeTask(task, agents);

console.log('📊 Repo Profile:');
console.log(`   Languages: ${routerResult.repoProfile.languages.map(l => `${l.name} (${l.percentage}%)`).join(', ')}`);
console.log(`   Frameworks: ${routerResult.repoProfile.frameworks.join(', ') || 'none detected'}`);
console.log(`   Build: ${routerResult.repoProfile.buildSystem ?? 'unknown'}`);
console.log(`   Tests: ${routerResult.repoProfile.testFramework ?? 'unknown'}`);
console.log(`   Package Manager: ${routerResult.repoProfile.packageManager ?? 'unknown'}\n`);

console.log('📈 Agent Scores:');
for (const score of routerResult.scores) {
  const bar = '█'.repeat(Math.round(score.score * 20)).padEnd(20, '░');
  console.log(`   ${bar} ${(score.score * 100).toFixed(0)}% — ${score.agentId}`);
  console.log(`      lang=${score.breakdown.languageMatch} fw=${score.breakdown.frameworkMatch} task=${score.breakdown.taskTypeMatch} tools=${score.breakdown.toolAvailability}`);
}

console.log(`\n✅ Routing Decision:`);
console.log(`   Agent: ${routerResult.decision.agentId}`);
console.log(`   Confidence: ${(routerResult.decision.confidence * 100).toFixed(0)}%`);
console.log(`   Reasoning: ${routerResult.decision.reasoning}`);
console.log(`   Fallbacks: [${routerResult.decision.fallbackAgents.join(', ')}]\n`);

// ─── 4. Walk the state machine ───────────────────────────────

console.log('🔄 Walking workflow state machine:\n');

const machine = new WorkflowStateMachine(task.id);

machine.onTransition((event) => {
  console.log(`   ${event.fromPhase} → ${event.toPhase}${event.reason ? ` (${event.reason})` : ''}`);
});

machine.transition(WorkflowPhase.Planning, 'Agent generating plan');
machine.transition(WorkflowPhase.Planned, 'Plan approved');
machine.transition(WorkflowPhase.Executing, 'Starting code changes');
machine.transition(WorkflowPhase.Executed, 'Changes applied');
machine.transition(WorkflowPhase.Verifying, 'Running verification checks');
machine.transition(WorkflowPhase.Verified, 'All checks passed');
machine.transition(WorkflowPhase.Done, 'Workflow complete');

console.log(`\n   Final phase: ${machine.phase}`);
console.log(`   Total events: ${machine.current.events.length}`);
console.log(`   Terminal: ${machine.isTerminal}`);

// ─── 5. Persist to store and query via MCP tools ─────────────

console.log('\n💾 Persisting to store and querying via MCP tools:\n');

const store = new InMemoryWorkflowStore();
await store.initialize();

await store.saveTask(task);
await store.saveWorkflow(machine.current);
for (const event of machine.current.events) {
  await store.appendEvent(event);
}

const handler = new HarnessToolHandler(store);

const workflows = await handler.handle('workflow/discover', { limit: 10 });
console.log(`   workflow/discover → ${workflows.length} workflow(s) found`);

const status = await handler.handle('workflow/status', { workflowId: machine.current.id });
console.log(`   workflow/status → phase: ${status?.phase}`);

const events = await handler.handle('workflow/events', { workflowId: machine.current.id });
console.log(`   workflow/events → ${events.length} events`);

const daily = await handler.handle('daily/summary', {});
console.log(`   daily/summary → ${daily.completedTasks}/${daily.totalTasks} tasks completed`);

// ─── 6. Demo failure + retry ─────────────────────────────────

console.log('\n🔁 Demo: failure and retry flow:\n');

const machine2 = new WorkflowStateMachine(taskId('task-002'));

machine2.onTransition((event) => {
  console.log(`   ${event.fromPhase} → ${event.toPhase}${event.reason ? ` (${event.reason})` : ''}`);
});

machine2.transition(WorkflowPhase.Planning, 'Starting');
machine2.transition(WorkflowPhase.Planned);
machine2.transition(WorkflowPhase.Executing, 'Agent working');
machine2.transition(WorkflowPhase.Failed, 'Agent hit rate limit');
machine2.transition(WorkflowPhase.Executing, 'Retrying with backoff');
machine2.transition(WorkflowPhase.Executed, 'Success on retry');
machine2.transition(WorkflowPhase.Verifying);
machine2.transition(WorkflowPhase.Verified);
machine2.transition(WorkflowPhase.Done, 'Completed after retry');

console.log(`\n   Final: ${machine2.phase} after ${machine2.current.events.length} transitions`);

await store.close();
console.log('\n🎉 Demo complete!\n');
