import type {
  Id,
  Task,
  WorkflowRun,
  WorkflowPlan,
  ExecutionResult,
  VerificationResult,
  RoutingDecision,
  WorkflowEvent,
} from "./types.js";
import {
  WorkflowStateMachine,
  type WorkflowEventListener,
} from "./state-machine.js";

export type WorkflowExecutorState = "idle" | "running" | "paused" | "cancelled";

export interface WorkflowExecutorCallbacks {
  onPlan: (task: Task, agentId: Id) => Promise<WorkflowPlan>;
  onExecute: (task: Task, plan: WorkflowPlan, agentId: Id) => Promise<ExecutionResult>;
  onVerify: (task: Task, result: ExecutionResult) => Promise<VerificationResult>;
  onRoute: (task: Task) => Promise<RoutingDecision>;
}

/**
 * Workflow executor: orchestrates Plan → Execute → Verify per task.
 * Delegates actual work to callbacks while managing lifecycle state.
 */
export class WorkflowExecutor {
  private workflows = new Map<Id, WorkflowRun>();
  private machines = new Map<Id, WorkflowStateMachine>();
  private executorStates = new Map<Id, WorkflowExecutorState>();
  private listeners: WorkflowEventListener[] = [];

  constructor(private callbacks: WorkflowExecutorCallbacks) {}

  /** Create a new workflow for a task */
  createWorkflow(task: Task): WorkflowRun {
    const id = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const workflow: WorkflowRun = {
      id,
      taskId: task.id,
      phase: "Created",
      transitions: [],
      createdAt: now,
      updatedAt: now,
    };

    const machine = new WorkflowStateMachine(id);
    machine.on((event) => this.emitEvent(event));

    this.workflows.set(id, workflow);
    this.machines.set(id, machine);
    this.executorStates.set(id, "idle");

    this.emitEvent({
      type: "workflow:created",
      workflowId: id,
      data: { taskId: task.id },
      timestamp: now,
    });

    return workflow;
  }

  /** Run a workflow through the full Plan → Execute → Verify lifecycle */
  async run(workflowId: Id, task: Task): Promise<WorkflowRun> {
    const workflow = this.getWorkflow(workflowId);
    const machine = this.getMachine(workflowId);

    this.executorStates.set(workflowId, "running");

    try {
      // Phase 1: Route
      const routing = await this.callbacks.onRoute(task);
      workflow.routingDecision = routing;
      workflow.agentId = routing.selectedAgentId;

      this.emitEvent({
        type: "routing:decided",
        workflowId,
        data: { agentId: routing.selectedAgentId, confidence: routing.confidence },
        timestamp: new Date().toISOString(),
      });

      // Phase 2: Plan
      this.checkNotCancelled(workflowId);
      machine.transition("Planning");
      this.syncPhase(workflow, machine);

      const plan = await this.callbacks.onPlan(task, routing.selectedAgentId);
      workflow.plan = plan;

      machine.transition("Planned");
      this.syncPhase(workflow, machine);

      // Phase 3: Execute
      this.checkNotCancelled(workflowId);
      await this.waitIfPaused(workflowId);
      machine.transition("Executing");
      this.syncPhase(workflow, machine);

      const execResult = await this.callbacks.onExecute(task, plan, routing.selectedAgentId);
      workflow.executionResult = execResult;

      machine.transition("Executed");
      this.syncPhase(workflow, machine);

      // Phase 4: Verify
      this.checkNotCancelled(workflowId);
      machine.transition("Verifying");
      this.syncPhase(workflow, machine);

      const verification = await this.callbacks.onVerify(task, execResult);
      workflow.verificationResult = verification;

      machine.transition("Verified");
      this.syncPhase(workflow, machine);

      // Done
      machine.transition("Done");
      this.syncPhase(workflow, machine);
      this.executorStates.set(workflowId, "idle");

      return workflow;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      workflow.error = errorMsg;

      if (!machine.isTerminal) {
        machine.transition("Failed", errorMsg);
        this.syncPhase(workflow, machine);
      }

      this.executorStates.set(workflowId, "idle");
      return workflow;
    }
  }

  /** Pause a running workflow */
  pause(workflowId: Id): void {
    if (this.executorStates.get(workflowId) === "running") {
      this.executorStates.set(workflowId, "paused");
    }
  }

  /** Resume a paused workflow */
  resume(workflowId: Id): void {
    if (this.executorStates.get(workflowId) === "paused") {
      this.executorStates.set(workflowId, "running");
    }
  }

  /** Cancel a running/paused workflow */
  cancel(workflowId: Id): void {
    this.executorStates.set(workflowId, "cancelled");
    const machine = this.machines.get(workflowId);
    const workflow = this.workflows.get(workflowId);
    if (machine && workflow && !machine.isTerminal) {
      machine.transition("Failed", "Cancelled by user");
      this.syncPhase(workflow, machine);
    }
  }

  /** Get a workflow by ID */
  getWorkflow(workflowId: Id): WorkflowRun {
    const wf = this.workflows.get(workflowId);
    if (!wf) throw new Error(`Workflow "${workflowId}" not found`);
    return wf;
  }

  /** Get all workflows */
  getAllWorkflows(): WorkflowRun[] {
    return [...this.workflows.values()];
  }

  /** Get executor state for a workflow */
  getExecutorState(workflowId: Id): WorkflowExecutorState {
    return this.executorStates.get(workflowId) ?? "idle";
  }

  /** Subscribe to workflow events */
  on(listener: WorkflowEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private getMachine(workflowId: Id): WorkflowStateMachine {
    const m = this.machines.get(workflowId);
    if (!m) throw new Error(`No state machine for workflow "${workflowId}"`);
    return m;
  }

  private syncPhase(workflow: WorkflowRun, machine: WorkflowStateMachine): void {
    workflow.phase = machine.phase;
    workflow.transitions = [...machine.transitions];
    workflow.updatedAt = new Date().toISOString();
  }

  private checkNotCancelled(workflowId: Id): void {
    if (this.executorStates.get(workflowId) === "cancelled") {
      throw new Error("Workflow cancelled");
    }
  }

  private async waitIfPaused(workflowId: Id): Promise<void> {
    while (this.executorStates.get(workflowId) === "paused") {
      await new Promise((r) => setTimeout(r, 200));
    }
    this.checkNotCancelled(workflowId);
  }

  private emitEvent(event: WorkflowEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener errors must not break the executor
      }
    }
  }
}
