import type { Task, TaskId, Workflow, WorkflowId, WorkflowEvent, DailyProgress } from '../contracts/types.js';

/**
 * Abstract persistence interface for workflows and tasks.
 * Implementations: SQLiteWorkflowStore (built-in), or bring your own.
 */
export interface WorkflowStore {
  // ── Tasks ──────────────────────────────────────────────────
  saveTask(task: Task): Promise<void>;
  getTask(id: TaskId): Promise<Task | null>;
  listTasks(options?: ListTasksOptions): Promise<readonly Task[]>;

  // ── Workflows ──────────────────────────────────────────────
  saveWorkflow(workflow: Workflow): Promise<void>;
  getWorkflow(id: WorkflowId): Promise<Workflow | null>;
  getWorkflowByTask(taskId: TaskId): Promise<Workflow | null>;
  listWorkflows(options?: ListWorkflowsOptions): Promise<readonly Workflow[]>;

  // ── Events ─────────────────────────────────────────────────
  appendEvent(event: WorkflowEvent): Promise<void>;
  getEvents(workflowId: WorkflowId): Promise<readonly WorkflowEvent[]>;

  // ── Aggregation ────────────────────────────────────────────
  getDailyProgress(date: string): Promise<DailyProgress>;

  // ── Lifecycle ──────────────────────────────────────────────
  initialize(): Promise<void>;
  close(): Promise<void>;
}

export interface ListTasksOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly since?: Date;
}

export interface ListWorkflowsOptions {
  readonly limit?: number;
  readonly offset?: number;
  readonly phase?: string;
  readonly since?: Date;
}
