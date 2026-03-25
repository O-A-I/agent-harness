import { describe, it, expect } from 'vitest';
import {
  WorkflowPhase,
  WorkflowStateMachine,
  InvalidTransitionError,
  taskId,
} from '../src/index.js';

describe('WorkflowStateMachine', () => {
  function createMachine() {
    return new WorkflowStateMachine(taskId('test-task-1'));
  }

  it('starts in Created phase', () => {
    const machine = createMachine();
    expect(machine.phase).toBe(WorkflowPhase.Created);
    expect(machine.isTerminal).toBe(false);
  });

  it('transitions through happy path', () => {
    const machine = createMachine();

    machine.transition(WorkflowPhase.Planning, 'Starting planning');
    expect(machine.phase).toBe(WorkflowPhase.Planning);

    machine.transition(WorkflowPhase.Planned);
    machine.transition(WorkflowPhase.Executing);
    machine.transition(WorkflowPhase.Executed);
    machine.transition(WorkflowPhase.Verifying);
    machine.transition(WorkflowPhase.Verified);
    machine.transition(WorkflowPhase.Done);

    expect(machine.phase).toBe(WorkflowPhase.Done);
    expect(machine.isTerminal).toBe(true);
  });

  it('records events for each transition', () => {
    const machine = createMachine();
    machine.transition(WorkflowPhase.Planning);
    machine.transition(WorkflowPhase.Planned);

    const events = machine.current.events;
    expect(events).toHaveLength(2);
    expect(events[0].fromPhase).toBe(WorkflowPhase.Created);
    expect(events[0].toPhase).toBe(WorkflowPhase.Planning);
    expect(events[1].fromPhase).toBe(WorkflowPhase.Planning);
    expect(events[1].toPhase).toBe(WorkflowPhase.Planned);
  });

  it('stores reason and metadata in events', () => {
    const machine = createMachine();
    machine.transition(WorkflowPhase.Planning, 'User initiated', { source: 'manual' });

    const event = machine.current.events[0];
    expect(event.reason).toBe('User initiated');
    expect(event.metadata).toEqual({ source: 'manual' });
  });

  it('throws InvalidTransitionError on invalid transitions', () => {
    const machine = createMachine();
    expect(() => machine.transition(WorkflowPhase.Executing)).toThrow(InvalidTransitionError);
  });

  it('notifies listeners on transition', () => {
    const machine = createMachine();
    const events: string[] = [];

    machine.onTransition((event) => {
      events.push(`${event.fromPhase}→${event.toPhase}`);
    });

    machine.transition(WorkflowPhase.Planning);
    machine.transition(WorkflowPhase.Planned);

    expect(events).toEqual(['created→planning', 'planning→planned']);
  });

  it('allows unsubscribing listeners', () => {
    const machine = createMachine();
    const events: string[] = [];

    const unsub = machine.onTransition((event) => {
      events.push(event.toPhase);
    });

    machine.transition(WorkflowPhase.Planning);
    unsub();
    machine.transition(WorkflowPhase.Planned);

    expect(events).toEqual([WorkflowPhase.Planning]);
  });

  it('supports failure and retry', () => {
    const machine = createMachine();
    machine.transition(WorkflowPhase.Planning);
    machine.transition(WorkflowPhase.Failed, 'Agent crashed');

    expect(machine.phase).toBe(WorkflowPhase.Failed);
    expect(machine.isTerminal).toBe(true);

    // Retry
    machine.transition(WorkflowPhase.Planning, 'Retrying');
    expect(machine.phase).toBe(WorkflowPhase.Planning);
    expect(machine.isTerminal).toBe(false);
  });

  it('updates timestamps on transition', () => {
    const machine = createMachine();
    const createdAt = machine.current.updatedAt;

    machine.transition(WorkflowPhase.Planning);
    expect(machine.current.updatedAt.getTime()).toBeGreaterThanOrEqual(createdAt.getTime());
  });

  describe('fromWorkflow', () => {
    it('reconstructs machine from persisted workflow', () => {
      const machine = createMachine();
      machine.transition(WorkflowPhase.Planning);
      machine.transition(WorkflowPhase.Planned);

      const restored = WorkflowStateMachine.fromWorkflow(machine.current);
      expect(restored.phase).toBe(WorkflowPhase.Planned);
      expect(restored.current.events).toHaveLength(2);

      // Can continue from restored state
      restored.transition(WorkflowPhase.Executing);
      expect(restored.phase).toBe(WorkflowPhase.Executing);
    });
  });
});
