import { describe, it, expect } from 'vitest';
import { routeTask } from '../src/index.js';
import { taskId, agentId, type Task, type AgentCapability, type RepoProfile } from '@agent-harness/core';

describe('router', () => {
  const tsRepo: RepoProfile = {
    rootPath: '/repo',
    languages: [
      { name: 'typescript', percentage: 80, fileCount: 200 },
    ],
    frameworks: ['react'],
    buildSystem: 'npm',
    testFramework: 'vitest',
    packageManager: 'pnpm',
  };

  const tsAgent: AgentCapability = {
    agentId: agentId('ts-agent'),
    name: 'TS Agent',
    description: 'TypeScript specialist',
    languages: ['typescript'],
    frameworks: ['react'],
    taskTypes: ['bugfix', 'feature'],
    mcpTools: ['ts-lint'],
  };

  const pyAgent: AgentCapability = {
    agentId: agentId('py-agent'),
    name: 'Python Agent',
    description: 'Python specialist',
    languages: ['python'],
    frameworks: ['django'],
    taskTypes: ['bugfix'],
    mcpTools: [],
  };

  const task: Task = {
    id: taskId('task-1'),
    title: 'Fix login bug',
    description: 'Login button crashes on click',
    source: { type: 'manual', createdBy: 'test' },
    repoContext: {
      rootPath: '/repo',
      languages: ['typescript'],
      frameworks: ['react'],
    },
    createdAt: new Date(),
    metadata: {},
  };

  it('routes to best-matching agent', async () => {
    const result = await routeTask(task, [tsAgent, pyAgent], {
      repoProfile: tsRepo,
    });

    expect(result.decision.agentId).toBe('ts-agent');
    expect(result.decision.confidence).toBeGreaterThan(0.5);
    expect(result.decision.fallbackAgents).toContain('py-agent');
    expect(result.scores).toHaveLength(2);
    expect(result.repoProfile).toBe(tsRepo);
  });

  it('uses default agent when confidence is low', async () => {
    const result = await routeTask(task, [pyAgent], {
      repoProfile: tsRepo,
      minConfidence: 0.9,
      defaultAgentId: 'py-agent',
    });

    expect(result.decision.agentId).toBe('py-agent');
    expect(result.decision.reasoning).toContain('default agent');
  });

  it('throws when no agents are provided', async () => {
    await expect(
      routeTask(task, [], { repoProfile: tsRepo }),
    ).rejects.toThrow('No agents available');
  });

  it('includes reasoning in decision', async () => {
    const result = await routeTask(task, [tsAgent], {
      repoProfile: tsRepo,
    });

    expect(result.decision.reasoning).toBeTruthy();
    expect(result.decision.reasoning.length).toBeGreaterThan(0);
  });
});
