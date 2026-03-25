import { describe, it, expect, beforeEach } from 'vitest';
import { HarnessToolHandler } from '../src/index.js';
import {
  InMemoryWorkflowStore,
  WorkflowPhase,
  workflowId,
  taskId,
  type Workflow,
} from '@agent-harness/core';

describe('HarnessToolHandler', () => {
  let store: InMemoryWorkflowStore;
  let handler: HarnessToolHandler;

  const testWorkflow: Workflow = {
    id: workflowId('wf-1'),
    taskId: taskId('task-1'),
    phase: WorkflowPhase.Executing,
    routing: null,
    verification: null,
    createdAt: new Date('2026-03-25T10:00:00Z'),
    updatedAt: new Date('2026-03-25T10:00:00Z'),
    events: [],
  };

  beforeEach(async () => {
    store = new InMemoryWorkflowStore();
    await store.initialize();
    handler = new HarnessToolHandler(store);
  });

  it('handles workflow/discover', async () => {
    await store.saveWorkflow(testWorkflow);
    const result = await handler.handle('workflow/discover', { limit: 10 });
    expect(result).toHaveLength(1);
  });

  it('handles workflow/status', async () => {
    await store.saveWorkflow(testWorkflow);
    const result = await handler.handle('workflow/status', { workflowId: 'wf-1' });
    expect(result).toEqual(testWorkflow);
  });

  it('handles workflow/events', async () => {
    const result = await handler.handle('workflow/events', { workflowId: 'wf-1' });
    expect(result).toEqual([]);
  });

  it('handles daily/summary', async () => {
    await store.saveWorkflow(testWorkflow);
    const result = (await handler.handle('daily/summary', { date: '2026-03-25' })) as {
      totalTasks: number;
    };
    expect(result.totalTasks).toBe(1);
  });

  it('throws on unknown tool', async () => {
    await expect(handler.handle('unknown/tool', {})).rejects.toThrow('Unknown tool');
  });
});
