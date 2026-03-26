import { WorkflowPhase } from '../contracts/types.js';

export type PhaseTransition = {
  readonly from: WorkflowPhase;
  readonly to: WorkflowPhase;
};

/**
 * Valid transitions in the workflow lifecycle FSM.
 *
 * Created → Planning → Planned → Executing → Executed → Verifying → Verified → Done
 *                                                                              ↗
 * Any phase (except Done) ──────────────────────────────────────────────→ Failed
 *
 * Retry paths:
 *   Failed → Planning   (re-plan)
 *   Failed → Executing  (re-execute)
 *   Verified → Executing (re-execute after verification issues)
 */
const VALID_TRANSITIONS: readonly PhaseTransition[] = [
  // Happy path
  { from: WorkflowPhase.Created, to: WorkflowPhase.Planning },
  { from: WorkflowPhase.Planning, to: WorkflowPhase.Planned },
  { from: WorkflowPhase.Planned, to: WorkflowPhase.Executing },
  { from: WorkflowPhase.Executing, to: WorkflowPhase.Executed },
  { from: WorkflowPhase.Executed, to: WorkflowPhase.Verifying },
  { from: WorkflowPhase.Verifying, to: WorkflowPhase.Verified },
  { from: WorkflowPhase.Verified, to: WorkflowPhase.Done },

  // Failure from any active phase
  { from: WorkflowPhase.Created, to: WorkflowPhase.Failed },
  { from: WorkflowPhase.Planning, to: WorkflowPhase.Failed },
  { from: WorkflowPhase.Planned, to: WorkflowPhase.Failed },
  { from: WorkflowPhase.Executing, to: WorkflowPhase.Failed },
  { from: WorkflowPhase.Executed, to: WorkflowPhase.Failed },
  { from: WorkflowPhase.Verifying, to: WorkflowPhase.Failed },
  { from: WorkflowPhase.Verified, to: WorkflowPhase.Failed },

  // Retry paths
  { from: WorkflowPhase.Failed, to: WorkflowPhase.Planning },
  { from: WorkflowPhase.Failed, to: WorkflowPhase.Executing },
  { from: WorkflowPhase.Verified, to: WorkflowPhase.Executing },
];

const transitionSet = new Set(VALID_TRANSITIONS.map((t) => `${t.from}→${t.to}`));

export function isValidTransition(from: WorkflowPhase, to: WorkflowPhase): boolean {
  return transitionSet.has(`${from}→${to}`);
}

export function getValidNextPhases(from: WorkflowPhase): readonly WorkflowPhase[] {
  return VALID_TRANSITIONS.filter((t) => t.from === from).map((t) => t.to);
}

export function isTerminalPhase(phase: WorkflowPhase): boolean {
  return phase === WorkflowPhase.Done || phase === WorkflowPhase.Failed;
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: WorkflowPhase,
    public readonly to: WorkflowPhase,
  ) {
    super(
      `Invalid workflow transition: ${from} → ${to}. Valid transitions from ${from}: [${getValidNextPhases(from).join(', ')}]`,
    );
    this.name = 'InvalidTransitionError';
  }
}
