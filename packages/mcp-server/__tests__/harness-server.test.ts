import { describe, it, expect, beforeEach, vi } from "vitest";
import type { WorkflowRun, DailyProgress, Id } from "@agent-harness/core";
import type { HarnessServerDeps } from "../src/harness-server.js";
import { HarnessMCPServer } from "../src/harness-server.js";

const makeWorkflow = (id: string, phase = "Done"): WorkflowRun => ({
  id,
  taskId: `task-${id}`,
  phase: phase as WorkflowRun["phase"],
  agentId: "agent-1",
  transitions: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T01:00:00Z",
});

const makeDailyProgress = (): DailyProgress => ({
  date: "2026-03-25",
  workflowsStarted: 5,
  workflowsCompleted: 3,
  workflowsFailed: 1,
  tasksRouted: 5,
  verificationsRun: 4,
  verificationPassRate: 75.0,
  topAgents: [{ agentId: "agent-1", tasksHandled: 3 }],
});

function createDeps(overrides?: Partial<HarnessServerDeps>): HarnessServerDeps {
  return {
    getWorkflows: () => [makeWorkflow("wf-1"), makeWorkflow("wf-2", "Failed")],
    getWorkflow: (id: Id) =>
      id === "wf-1" ? makeWorkflow("wf-1") : undefined,
    getDailyProgress: (_date?: string) => makeDailyProgress(),
    ...overrides,
  };
}

describe("HarnessMCPServer", () => {
  it("can be constructed with deps", () => {
    const server = new HarnessMCPServer(createDeps());
    expect(server).toBeDefined();
  });

  it("constructor does not throw with empty deps", () => {
    expect(
      () =>
        new HarnessMCPServer({
          getWorkflows: () => [],
          getWorkflow: () => undefined,
          getDailyProgress: () => undefined,
        })
    ).not.toThrow();
  });
});

describe("HarnessServerDeps contract", () => {
  it("getWorkflows returns workflow list", () => {
    const deps = createDeps();
    const workflows = deps.getWorkflows();
    expect(workflows).toHaveLength(2);
    expect(workflows[0].id).toBe("wf-1");
    expect(workflows[1].phase).toBe("Failed");
  });

  it("getWorkflow returns single workflow or undefined", () => {
    const deps = createDeps();
    expect(deps.getWorkflow("wf-1")).toBeDefined();
    expect(deps.getWorkflow("nonexistent")).toBeUndefined();
  });

  it("getDailyProgress returns progress data", () => {
    const deps = createDeps();
    const progress = deps.getDailyProgress("2026-03-25");
    expect(progress).toBeDefined();
    expect(progress!.workflowsCompleted).toBe(3);
    expect(progress!.verificationPassRate).toBe(75.0);
  });

  it("getDailyProgress returns undefined for unknown date", () => {
    const deps = createDeps({
      getDailyProgress: () => undefined,
    });
    expect(deps.getDailyProgress("2020-01-01")).toBeUndefined();
  });
});
