import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryWorkflowStore,
  WorkflowPhase,
  taskId,
  workflowId,
  type Task,
  type Workflow,
} from '../src/index.js';

describe('InMemoryWorkflowStore', () => {
  let store: InMemoryWorkflowStore;

  const testTask: Task = {
    id: taskId('task-1'),
    title: 'Fix login bug',
    description: 'Users report login fails on Safari',
    source: { type: 'manual', createdBy: 'dev' },
    repoContext: {
      rootPath: '/repo',
      languages: ['typescript'],
      frameworks: ['react'],
    },
    createdAt: new Date('2026-03-25T10:00:00Z'),
    metadata: {},
  };

  const testWorkflow: Workflow = {
    id: workflowId('wf-1'),
    taskId: taskId('task-1'),
    phase: WorkflowPhase.Created,
    routing: null,
    verification: null,
    createdAt: new Date('2026-03-25T10:00:00Z'),
    updatedAt: new Date('2026-03-25T10:00:00Z'),
    events: [],
  };

  beforeEach(async () => {
    store = new InMemoryWorkflowStore();
    await store.initialize();
  });

  describe('tasks', () => {
    it('saves and retrieves a task', async () => {
      await store.saveTask(testTask);
      const retrieved = await store.getTask(testTask.id);
      expect(retrieved).toEqual(testTask);
    });

    it('returns null for unknown task', async () => {
      expect(await store.getTask(taskId('nonexistent'))).toBeNull();
    });

    it('lists tasks with pagination', async () => {
      await store.saveTask(testTask);
      await store.saveTask({
        ...testTask,
        id: taskId('task-2'),
        title: 'Second task',
        createdAt: new Date('2026-03-25T11:00:00Z'),
      });

      const all = await store.listTasks();
      expect(all).toHaveLength(2);

      const page = await store.listTasks({ limit: 1 });
      expect(page).toHaveLength(1);
    });
  });

  describe('workflows', () => {
    it('saves and retrieves a workflow', async () => {
      await store.saveWorkflow(testWorkflow);
      const retrieved = await store.getWorkflow(testWorkflow.id);
      expect(retrieved).toEqual(testWorkflow);
    });

    it('finds workflow by task ID', async () => {
      await store.saveWorkflow(testWorkflow);
      const found = await store.getWorkflowByTask(testTask.id);
      expect(found?.id).toBe(testWorkflow.id);
    });

    it('returns null for unknown workflow', async () => {
      expect(await store.getWorkflow(workflowId('nonexistent'))).toBeNull();
    });
  });

  describe('events', () => {
    it('appends and retrieves events', async () => {
      const event = {
        id: 'evt-1',
        workflowId: testWorkflow.id,
        fromPhase: WorkflowPhase.Created,
        toPhase: WorkflowPhase.Planning,
        timestamp: new Date(),
      };

      await store.appendEvent(event);
      const events = await store.getEvents(testWorkflow.id);
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(event);
    });
  });

  describe('daily progress', () => {
    it('aggregates workflows by date', async () => {
      await store.saveWorkflow(testWorkflow);
      await store.saveWorkflow({
        ...testWorkflow,
        id: workflowId('wf-2'),
        taskId: taskId('task-2'),
        phase: WorkflowPhase.Done,
      });

      const progress = await store.getDailyProgress('2026-03-25');
      expect(progress.totalTasks).toBe(2);
      expect(progress.completedTasks).toBe(1);
    });
  });
});
