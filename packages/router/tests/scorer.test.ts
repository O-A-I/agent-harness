import { describe, it, expect } from 'vitest';
import { scoreAgents } from '../src/index.js';
import { taskId, agentId, type Task, type RepoProfile, type AgentCapability } from '@agent-harness/core';

describe('scorer', () => {
  const tsRepo: RepoProfile = {
    rootPath: '/repo',
    languages: [
      { name: 'typescript', percentage: 70, fileCount: 140 },
      { name: 'javascript', percentage: 30, fileCount: 60 },
    ],
    frameworks: ['react', 'next.js'],
    buildSystem: 'npm',
    testFramework: 'vitest',
    packageManager: 'pnpm',
  };

  const tsAgent: AgentCapability = {
    agentId: agentId('ts-agent'),
    name: 'TypeScript Agent',
    description: 'TypeScript specialist',
    languages: ['typescript', 'javascript'],
    frameworks: ['react', 'next.js', 'express'],
    taskTypes: ['bugfix', 'feature', 'refactor'],
    mcpTools: ['ts-lint', 'ts-test'],
  };

  const pyAgent: AgentCapability = {
    agentId: agentId('py-agent'),
    name: 'Python Agent',
    description: 'Python specialist',
    languages: ['python'],
    frameworks: ['django', 'fastapi'],
    taskTypes: ['bugfix', 'feature'],
    mcpTools: ['py-lint'],
  };

  const genericAgent: AgentCapability = {
    agentId: agentId('generic-agent'),
    name: 'Generic Agent',
    description: 'General purpose',
    languages: [],
    frameworks: [],
    taskTypes: [],
    mcpTools: [],
  };

  function makeTask(title: string, description: string): Task {
    return {
      id: taskId('test-task'),
      title,
      description,
      source: { type: 'manual', createdBy: 'test' },
      repoContext: {
        rootPath: '/repo',
        languages: ['typescript'],
        frameworks: ['react'],
      },
      createdAt: new Date(),
      metadata: {},
    };
  }

  it('ranks TS agent highest for TS repo with bugfix task', () => {
    const task = makeTask('Fix login bug', 'Users report login fails on Safari');
    const scores = scoreAgents(task, tsRepo, [tsAgent, pyAgent, genericAgent]);

    expect(scores[0].agentId).toBe('ts-agent');
    expect(scores[0].score).toBeGreaterThan(0.7);
  });

  it('ranks PY agent low for TS repo', () => {
    const task = makeTask('Fix login bug', 'Login broken');
    const scores = scoreAgents(task, tsRepo, [tsAgent, pyAgent]);

    const pyScore = scores.find((s) => s.agentId === 'py-agent');
    expect(pyScore!.score).toBeLessThan(0.5);
  });

  it('gives higher score for task type match', () => {
    const refactorTask = makeTask('Refactor auth module', 'Clean up the authentication code');
    const scores = scoreAgents(refactorTask, tsRepo, [tsAgent, pyAgent]);

    expect(scores[0].agentId).toBe('ts-agent');
    expect(scores[0].breakdown.taskTypeMatch).toBeGreaterThanOrEqual(0.8);
  });

  it('handles empty agent list gracefully', () => {
    const task = makeTask('Test', 'test');
    const scores = scoreAgents(task, tsRepo, []);
    expect(scores).toHaveLength(0);
  });

  it('generic agent gets low but non-zero scores', () => {
    const task = makeTask('Do something', 'general task');
    const scores = scoreAgents(task, tsRepo, [genericAgent]);

    expect(scores[0].score).toBeGreaterThan(0);
    expect(scores[0].score).toBeLessThan(0.5);
  });
});
