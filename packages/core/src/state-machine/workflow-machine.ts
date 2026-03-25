import {
  type Workflow,
  type WorkflowEvent,
  type WorkflowId,
  type TaskId,
  WorkflowPhase,
  workflowId,
} from '../contracts/types.js';
import { isValidTransition, InvalidTransitionError, isTerminalPhase } from './transitions.js';

export type WorkflowListener = (event: WorkflowEvent) => void;

export class WorkflowStateMachine {
  private readonly listeners: WorkflowListener[] = [];
  private workflow: Workflow;

  constructor(taskId: TaskId, id?: WorkflowId) {
    const now = new Date();
    this.workflow = {
      id: id ?? workflowId(crypto.randomUUID()),
      taskId,
      phase: WorkflowPhase.Created,
      routing: null,
      verification: null,
      createdAt: now,
      updatedAt: now,
      events: [],
    };
  }

  get current(): Readonly<Workflow> {
    return this.workflow;
  }

  get phase(): WorkflowPhase {
    return this.workflow.phase;
  }

  get isTerminal(): boolean {
    return isTerminalPhase(this.workflow.phase);
  }

  transition(to: WorkflowPhase, reason?: string, metadata?: Record<string, unknown>): void {
    const from = this.workflow.phase;

    if (!isValidTransition(from, to)) {
      throw new InvalidTransitionError(from, to);
    }

    const event: WorkflowEvent = {
      id: crypto.randomUUID(),
      workflowId: this.workflow.id,
      fromPhase: from,
      toPhase: to,
      timestamp: new Date(),
      reason,
      metadata,
    };

    this.workflow = {
      ...this.workflow,
      phase: to,
      updatedAt: event.timestamp,
      events: [...this.workflow.events, event],
    };

    for (const listener of this.listeners) {
      listener(event);
    }
  }

  onTransition(listener: WorkflowListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  /**
   * Reconstruct state machine from a persisted workflow.
   */
  static fromWorkflow(workflow: Workflow): WorkflowStateMachine {
    const machine = new WorkflowStateMachine(workflow.taskId, workflow.id);
    // Overwrite the internal state with the persisted workflow
    machine.workflow = workflow;
    return machine;
  }
}
