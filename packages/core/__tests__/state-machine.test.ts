import { describe, it, expect, vi } from "vitest";
import {
  WorkflowStateMachine,
  InvalidTransitionError,
  WORKFLOW_PHASES,
  getTransitionMap,
} from "../src/state-machine.js";
import type { WorkflowEvent, WorkflowPhase } from "../src/types.js";

describe("WorkflowStateMachine", () => {
  it("starts in Created phase", () => {
    const sm = new WorkflowStateMachine("wf-1");
    expect(sm.phase).toBe("Created");
    expect(sm.isTerminal).toBe(false);
    expect(sm.transitions).toHaveLength(0);
  });

  it("follows the happy path: Created → … → Done", () => {
    const sm = new WorkflowStateMachine("wf-1");
    const phases: WorkflowPhase[] = [
      "Planning",
      "Planned",
      "Executing",
      "Executed",
      "Verifying",
      "Verified",
      "Done",
    ];

    for (const phase of phases) {
      sm.transition(phase);
    }

    expect(sm.phase).toBe("Done");
    expect(sm.isTerminal).toBe(true);
    expect(sm.transitions).toHaveLength(7);
  });

  it("allows failure from any non-terminal phase", () => {
    const nonTerminalPhases: WorkflowPhase[] = [
      "Created",
      "Planning",
      "Planned",
      "Executing",
      "Executed",
      "Verifying",
      "Verified",
    ];

    for (const phase of nonTerminalPhases) {
      const sm = new WorkflowStateMachine("wf-fail", phase);
      expect(sm.canTransition("Failed")).toBe(true);
      sm.transition("Failed", `failed from ${phase}`);
      expect(sm.phase).toBe("Failed");
      expect(sm.isTerminal).toBe(true);
    }
  });

  it("rejects invalid transitions", () => {
    const sm = new WorkflowStateMachine("wf-1");

    expect(sm.canTransition("Executing")).toBe(false);
    expect(() => sm.transition("Executing")).toThrow(InvalidTransitionError);
    expect(() => sm.transition("Done")).toThrow(InvalidTransitionError);
    expect(() => sm.transition("Verified")).toThrow(InvalidTransitionError);
  });

  it("rejects transitions from terminal states", () => {
    const done = new WorkflowStateMachine("wf-done");
    done.transition("Planning");
    done.transition("Planned");
    done.transition("Executing");
    done.transition("Executed");
    done.transition("Verifying");
    done.transition("Verified");
    done.transition("Done");

    expect(() => done.transition("Created")).toThrow(InvalidTransitionError);
    expect(() => done.transition("Planning")).toThrow(InvalidTransitionError);

    const failed = new WorkflowStateMachine("wf-failed");
    failed.transition("Failed", "test");
    expect(() => failed.transition("Created")).toThrow(InvalidTransitionError);
  });

  it("records transition history with timestamps and reasons", () => {
    const sm = new WorkflowStateMachine("wf-1");
    sm.transition("Planning", "starting plan");
    sm.transition("Failed", "agent crashed");

    expect(sm.transitions).toHaveLength(2);
    expect(sm.transitions[0]).toMatchObject({
      from: "Created",
      to: "Planning",
      reason: "starting plan",
    });
    expect(sm.transitions[1]).toMatchObject({
      from: "Planning",
      to: "Failed",
      reason: "agent crashed",
    });
    expect(sm.transitions[0].timestamp).toBeTruthy();
  });

  it("emits events on transitions", () => {
    const sm = new WorkflowStateMachine("wf-events");
    const events: WorkflowEvent[] = [];
    sm.on((e) => events.push(e));

    sm.transition("Planning");
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("workflow:transition");

    sm.transition("Failed", "oops");
    // transition + failed = 2 more events
    expect(events).toHaveLength(3);
    expect(events[2].type).toBe("workflow:failed");
  });

  it("emits workflow:completed on Done", () => {
    const sm = new WorkflowStateMachine("wf-complete");
    const events: WorkflowEvent[] = [];
    sm.on((e) => events.push(e));

    sm.transition("Planning");
    sm.transition("Planned");
    sm.transition("Executing");
    sm.transition("Executed");
    sm.transition("Verifying");
    sm.transition("Verified");
    sm.transition("Done");

    const completedEvents = events.filter(
      (e) => e.type === "workflow:completed"
    );
    expect(completedEvents).toHaveLength(1);
  });

  it("listener errors do not break the state machine", () => {
    const sm = new WorkflowStateMachine("wf-err");
    sm.on(() => {
      throw new Error("listener boom");
    });

    expect(() => sm.transition("Planning")).not.toThrow();
    expect(sm.phase).toBe("Planning");
  });

  it("unsubscribe works", () => {
    const sm = new WorkflowStateMachine("wf-unsub");
    const events: WorkflowEvent[] = [];
    const unsub = sm.on((e) => events.push(e));

    sm.transition("Planning");
    expect(events).toHaveLength(1);

    unsub();
    sm.transition("Planned");
    expect(events).toHaveLength(1); // no new events
  });

  it("serializes and deserializes correctly", () => {
    const sm = new WorkflowStateMachine("wf-serde");
    sm.transition("Planning");
    sm.transition("Planned");

    const json = sm.toJSON();
    const restored = WorkflowStateMachine.fromJSON(json);

    expect(restored.workflowId).toBe("wf-serde");
    expect(restored.phase).toBe("Planned");
    expect(restored.transitions).toHaveLength(2);
    expect(restored.canTransition("Executing")).toBe(true);
  });

  it("validNextPhases returns correct options", () => {
    const sm = new WorkflowStateMachine("wf-next");
    expect(sm.validNextPhases).toEqual(["Planning", "Failed"]);

    sm.transition("Planning");
    expect(sm.validNextPhases).toEqual(["Planned", "Failed"]);
  });
});

describe("WORKFLOW_PHASES", () => {
  it("lists all phases in order", () => {
    expect(WORKFLOW_PHASES).toHaveLength(9);
    expect(WORKFLOW_PHASES[0]).toBe("Created");
    expect(WORKFLOW_PHASES[WORKFLOW_PHASES.length - 1]).toBe("Failed");
  });
});

describe("getTransitionMap", () => {
  it("returns a complete map", () => {
    const map = getTransitionMap();
    expect(map.size).toBe(9);
    expect(map.get("Done")).toEqual([]);
    expect(map.get("Failed")).toEqual([]);
    expect(map.get("Created")).toContain("Planning");
  });
});
