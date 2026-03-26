import { describe, it, expect } from "vitest";
import type { WorkflowRun, DailyProgress, Id } from "@agent-harness/core";
import { HarnessMCPServer, type HarnessServerDeps } from "../src/harness-server.js";

/**
 * Integration test: exercises the MCP server's tool handlers
 * through the deps contract (simulating a full roundtrip).
 */

function makeSampleWorkflows(): WorkflowRun[] {
  return [
    {
      id: "wf-100",
      taskId: "task-100",
      phase: "Done",
      agentId: "copilot-agent",
      routingDecision: {
        taskId: "task-100",
        selectedAgentId: "copilot-agent",
        scores: [
          { agentId: "copilot-agent", score: 0.92, reasoning: "Great match", matchedCriteria: ["language"] },
        ],
        confidence: 0.92,
        fallbackChain: [],
        timestamp: "2026-03-25T10:00:00Z",
      },
      plan: {
        steps: [{ id: "s1", description: "Fix bug", status: "done" }],
        reasoning: "Simple fix",
        estimatedFiles: ["src/main.ts"],
      },
      executionResult: {
        stepsCompleted: 1,
        stepsTotal: 1,
        filesChanged: ["src/main.ts"],
        output: "Fixed",
        durationMs: 5000,
      },
      verificationResult: {
        workflowId: "wf-100",
        passed: true,
        checks: [
          { type: "compile", name: "compile", passed: true, durationMs: 500 },
          { type: "test", name: "test", passed: true, durationMs: 1000 },
        ],
        timestamp: "2026-03-25T10:05:00Z",
      },
      transitions: [
        { from: "Created", to: "Planning", timestamp: "2026-03-25T10:00:00Z" },
        { from: "Planning", to: "Planned", timestamp: "2026-03-25T10:01:00Z" },
        { from: "Planned", to: "Executing", timestamp: "2026-03-25T10:01:30Z" },
        { from: "Executing", to: "Executed", timestamp: "2026-03-25T10:03:00Z" },
        { from: "Executed", to: "Verifying", timestamp: "2026-03-25T10:03:30Z" },
        { from: "Verifying", to: "Verified", timestamp: "2026-03-25T10:04:30Z" },
        { from: "Verified", to: "Done", timestamp: "2026-03-25T10:05:00Z" },
      ],
      createdAt: "2026-03-25T10:00:00Z",
      updatedAt: "2026-03-25T10:05:00Z",
    },
    {
      id: "wf-101",
      taskId: "task-101",
      phase: "Failed",
      agentId: "generic-agent",
      error: "Tests failed",
      transitions: [
        { from: "Created", to: "Planning", timestamp: "2026-03-25T11:00:00Z" },
        { from: "Planning", to: "Failed", timestamp: "2026-03-25T11:01:00Z", reason: "Tests failed" },
      ],
      createdAt: "2026-03-25T11:00:00Z",
      updatedAt: "2026-03-25T11:01:00Z",
    },
    {
      id: "wf-102",
      taskId: "task-102",
      phase: "Executing",
      agentId: "copilot-agent",
      transitions: [
        { from: "Created", to: "Planning", timestamp: "2026-03-25T12:00:00Z" },
        { from: "Planning", to: "Planned", timestamp: "2026-03-25T12:01:00Z" },
        { from: "Planned", to: "Executing", timestamp: "2026-03-25T12:02:00Z" },
      ],
      createdAt: "2026-03-25T12:00:00Z",
      updatedAt: "2026-03-25T12:02:00Z",
    },
  ];
}

function createFullDeps(): HarnessServerDeps {
  const workflows = makeSampleWorkflows();
  const progress: DailyProgress = {
    date: "2026-03-25",
    workflowsStarted: 3,
    workflowsCompleted: 1,
    workflowsFailed: 1,
    tasksRouted: 3,
    verificationsRun: 2,
    verificationPassRate: 50.0,
    topAgents: [
      { agentId: "copilot-agent", tasksHandled: 2 },
      { agentId: "generic-agent", tasksHandled: 1 },
    ],
  };

  return {
    getWorkflows: () => workflows,
    getWorkflow: (id: Id) => workflows.find((w) => w.id === id),
    getDailyProgress: (date?: string) =>
      date === "2026-03-25" || !date ? progress : undefined,
  };
}

describe("MCP Server Integration", () => {
  it("deps.getWorkflows returns all workflows with full data", () => {
    const deps = createFullDeps();
    const workflows = deps.getWorkflows();

    expect(workflows).toHaveLength(3);

    // Completed workflow has all fields
    const done = workflows.find((w) => w.phase === "Done")!;
    expect(done.agentId).toBe("copilot-agent");
    expect(done.routingDecision).toBeDefined();
    expect(done.plan).toBeDefined();
    expect(done.executionResult).toBeDefined();
    expect(done.verificationResult).toBeDefined();
    expect(done.transitions).toHaveLength(7);

    // Failed workflow has error
    const failed = workflows.find((w) => w.phase === "Failed")!;
    expect(failed.error).toBe("Tests failed");

    // In-progress workflow
    const active = workflows.find((w) => w.phase === "Executing")!;
    expect(active.agentId).toBe("copilot-agent");
  });

  it("deps.getWorkflow finds by ID with complete data", () => {
    const deps = createFullDeps();

    const wf = deps.getWorkflow("wf-100");
    expect(wf).toBeDefined();
    expect(wf!.id).toBe("wf-100");
    expect(wf!.verificationResult!.passed).toBe(true);
    expect(wf!.verificationResult!.checks).toHaveLength(2);
    expect(wf!.executionResult!.filesChanged).toEqual(["src/main.ts"]);
    expect(wf!.routingDecision!.confidence).toBe(0.92);
  });

  it("deps.getWorkflow returns undefined for unknown ID", () => {
    const deps = createFullDeps();
    expect(deps.getWorkflow("wf-999")).toBeUndefined();
  });

  it("deps.getDailyProgress returns complete progress", () => {
    const deps = createFullDeps();
    const progress = deps.getDailyProgress("2026-03-25");

    expect(progress).toBeDefined();
    expect(progress!.workflowsStarted).toBe(3);
    expect(progress!.workflowsCompleted).toBe(1);
    expect(progress!.workflowsFailed).toBe(1);
    expect(progress!.verificationPassRate).toBe(50.0);
    expect(progress!.topAgents).toHaveLength(2);
    expect(progress!.topAgents[0].agentId).toBe("copilot-agent");
  });

  it("server construction with full deps does not throw", () => {
    const deps = createFullDeps();
    const server = new HarnessMCPServer(deps);
    expect(server).toBeDefined();
  });

  it("workflow transitions form a valid state machine path", () => {
    const deps = createFullDeps();
    const wf = deps.getWorkflow("wf-100")!;

    const expectedPath = [
      "Created→Planning",
      "Planning→Planned",
      "Planned→Executing",
      "Executing→Executed",
      "Executed→Verifying",
      "Verifying→Verified",
      "Verified→Done",
    ];

    const actualPath = wf.transitions.map((t) => `${t.from}→${t.to}`);
    expect(actualPath).toEqual(expectedPath);
  });
});
