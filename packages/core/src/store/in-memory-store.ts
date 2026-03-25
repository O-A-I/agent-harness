import type {
  Task,
  TaskId,
  Workflow,
  WorkflowId,
  WorkflowEvent,
  DailyProgress,
  WorkflowSummary,
} from '../contracts/types.js';
import { WorkflowPhase } from '../contracts/types.js';
import type { WorkflowStore, ListTasksOptions, ListWorkflowsOptions } from './store.js';

/**
 * In-memory implementation of WorkflowStore.
 * Useful for testing and as a reference implementation.
 * For production persistence, use SQLiteWorkflowStore (planned).
 */
export class InMemoryWorkflowStore implements WorkflowStore {
  private tasks = new Map<TaskId, Task>();
  private workflows = new Map<WorkflowId, Workflow>();
  private events = new Map<WorkflowId, WorkflowEvent[]>();
  private taskToWorkflow = new Map<TaskId, WorkflowId>();

  async initialize(): Promise<void> {
    // No-op for in-memory store
  }

  async close(): Promise<void> {
    this.tasks.clear();
    this.workflows.clear();
    this.events.clear();
    this.taskToWorkflow.clear();
  }

  // ── Tasks ──────────────────────────────────────────────────

  async saveTask(task: Task): Promise<void> {
    this.tasks.set(task.id, task);
  }

  async getTask(id: TaskId): Promise<Task | null> {
    return this.tasks.get(id) ?? null;
  }

  async listTasks(options?: ListTasksOptions): Promise<readonly Task[]> {
    let tasks = Array.from(this.tasks.values());

    if (options?.since) {
      const since = options.since.getTime();
      tasks = tasks.filter((t) => t.createdAt.getTime() >= since);
    }

    tasks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 100;
    return tasks.slice(offset, offset + limit);
  }

  // ── Workflows ──────────────────────────────────────────────

  async saveWorkflow(workflow: Workflow): Promise<void> {
    this.workflows.set(workflow.id, workflow);
    this.taskToWorkflow.set(workflow.taskId, workflow.id);
  }

  async getWorkflow(id: WorkflowId): Promise<Workflow | null> {
    return this.workflows.get(id) ?? null;
  }

  async getWorkflowByTask(taskId: TaskId): Promise<Workflow | null> {
    const wfId = this.taskToWorkflow.get(taskId);
    if (!wfId) return null;
    return this.workflows.get(wfId) ?? null;
  }

  async listWorkflows(options?: ListWorkflowsOptions): Promise<readonly Workflow[]> {
    let workflows = Array.from(this.workflows.values());

    if (options?.phase) {
      workflows = workflows.filter((w) => w.phase === options.phase);
    }
    if (options?.since) {
      const since = options.since.getTime();
      workflows = workflows.filter((w) => w.createdAt.getTime() >= since);
    }

    workflows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 100;
    return workflows.slice(offset, offset + limit);
  }

  // ── Events ─────────────────────────────────────────────────

  async appendEvent(event: WorkflowEvent): Promise<void> {
    const existing = this.events.get(event.workflowId) ?? [];
    existing.push(event);
    this.events.set(event.workflowId, existing);
  }

  async getEvents(workflowId: WorkflowId): Promise<readonly WorkflowEvent[]> {
    return this.events.get(workflowId) ?? [];
  }

  // ── Aggregation ────────────────────────────────────────────

  async getDailyProgress(date: string): Promise<DailyProgress> {
    const workflows = Array.from(this.workflows.values()).filter((w) => {
      const wfDate = w.createdAt.toISOString().split('T')[0];
      return wfDate === date;
    });

    const summaries: WorkflowSummary[] = workflows.map((w) => ({
      workflowId: w.id,
      taskTitle: '', // Would need to join with tasks
      phase: w.phase,
      agentId: w.routing?.agentId,
      verification: w.verification ?? undefined,
    }));

    return {
      date,
      workflows: summaries,
      totalTasks: workflows.length,
      completedTasks: workflows.filter((w) => w.phase === WorkflowPhase.Done).length,
      failedTasks: workflows.filter((w) => w.phase === WorkflowPhase.Failed).length,
    };
  }
}
