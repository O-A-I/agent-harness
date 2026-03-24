import type {
  WorkflowPhase,
  WorkflowTransition,
  WorkflowEvent,
  WorkflowEventType,
  Id,
} from "./types.js";

/** Valid transitions in the workflow state machine */
const VALID_TRANSITIONS: ReadonlyMap<WorkflowPhase, readonly WorkflowPhase[]> =
  new Map([
    ["Created", ["Planning", "Failed"]],
    ["Planning", ["Planned", "Failed"]],
    ["Planned", ["Executing", "Failed"]],
    ["Executing", ["Executed", "Failed"]],
    ["Executed", ["Verifying", "Failed"]],
    ["Verifying", ["Verified", "Failed"]],
    ["Verified", ["Done", "Failed"]],
    // Terminal states — no outgoing transitions
    ["Done", []],
    ["Failed", []],
  ]);

export type WorkflowEventListener = (event: WorkflowEvent) => void;

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: WorkflowPhase,
    public readonly to: WorkflowPhase
  ) {
    super(`Invalid transition: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export class WorkflowStateMachine {
  private _phase: WorkflowPhase = "Created";
  private _transitions: WorkflowTransition[] = [];
  private _listeners: WorkflowEventListener[] = [];

  constructor(
    public readonly workflowId: Id,
    initialPhase: WorkflowPhase = "Created"
  ) {
    this._phase = initialPhase;
  }

  get phase(): WorkflowPhase {
    return this._phase;
  }

  get transitions(): ReadonlyArray<WorkflowTransition> {
    return this._transitions;
  }

  get isTerminal(): boolean {
    return this._phase === "Done" || this._phase === "Failed";
  }

  /** Returns phases reachable from the current phase */
  get validNextPhases(): readonly WorkflowPhase[] {
    return VALID_TRANSITIONS.get(this._phase) ?? [];
  }

  /** Check whether a transition is valid without performing it */
  canTransition(to: WorkflowPhase): boolean {
    return this.validNextPhases.includes(to);
  }

  /** Transition to a new phase. Throws InvalidTransitionError if invalid. */
  transition(to: WorkflowPhase, reason?: string): WorkflowTransition {
    if (!this.canTransition(to)) {
      throw new InvalidTransitionError(this._phase, to);
    }

    const from = this._phase;
    const timestamp = new Date().toISOString();

    const transition: WorkflowTransition = { from, to, timestamp, reason };
    this._transitions.push(transition);
    this._phase = to;

    // Emit transition event
    this.emit({
      type: "workflow:transition",
      workflowId: this.workflowId,
      data: { from, to, reason },
      timestamp,
    });

    // Emit terminal events
    if (to === "Done") {
      this.emit({
        type: "workflow:completed",
        workflowId: this.workflowId,
        data: { totalTransitions: this._transitions.length },
        timestamp,
      });
    } else if (to === "Failed") {
      this.emit({
        type: "workflow:failed",
        workflowId: this.workflowId,
        data: { failedFrom: from, reason },
        timestamp,
      });
    }

    return transition;
  }

  /** Subscribe to workflow events */
  on(listener: WorkflowEventListener): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== listener);
    };
  }

  /** Serialize state for persistence */
  toJSON(): {
    workflowId: Id;
    phase: WorkflowPhase;
    transitions: WorkflowTransition[];
  } {
    return {
      workflowId: this.workflowId,
      phase: this._phase,
      transitions: [...this._transitions],
    };
  }

  /** Restore from persisted state */
  static fromJSON(data: {
    workflowId: Id;
    phase: WorkflowPhase;
    transitions: WorkflowTransition[];
  }): WorkflowStateMachine {
    const sm = new WorkflowStateMachine(data.workflowId, data.phase);
    sm._transitions = [...data.transitions];
    return sm;
  }

  private emit(event: WorkflowEvent): void {
    for (const listener of this._listeners) {
      try {
        listener(event);
      } catch {
        // Listener errors must not break the state machine
      }
    }
  }
}

/** All workflow phases in lifecycle order */
export const WORKFLOW_PHASES: readonly WorkflowPhase[] = [
  "Created",
  "Planning",
  "Planned",
  "Executing",
  "Executed",
  "Verifying",
  "Verified",
  "Done",
  "Failed",
];

/** Get the valid transition map (for documentation/tooling) */
export function getTransitionMap(): ReadonlyMap<
  WorkflowPhase,
  readonly WorkflowPhase[]
> {
  return VALID_TRANSITIONS;
}
