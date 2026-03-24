import { describe, it, expect, vi } from "vitest";
import { WorkflowExecutor } from "../src/workflow-executor.js";
import type {
  Task,
  WorkflowPlan,
  ExecutionResult,
  VerificationResult,
  RoutingDecision,
  WorkflowEvent,
} from "../src/types.js";

const makeTask = (id = "task-1"): Task => ({
  id,
  title: "Fix the bug",
  description: "Something is broken",
  type: "bug-fix",
  repo: "/test/repo",
  createdAt: new Date().toISOString(),
});

const makePlan = (): WorkflowPlan => ({
  steps: [{ id: "s1", description: "Edit file", status: "pending" }],
  reasoning: "Simple fix",
  estimatedFiles: ["src/main.ts"],
});

const makeExecResult = (): ExecutionResult => ({
  stepsCompleted: 1,
  stepsTotal: 1,
  filesChanged: ["src/main.ts"],
  output: "Done",
  durationMs: 1000,
});

const makeVerificationResult = (
  workflowId: string,
  passed = true
): VerificationResult => ({
  workflowId,
  passed,
  checks: [
    { type: "compile", name: "compile", passed, durationMs: 500 },
    { type: "test", name: "test", passed, durationMs: 1000 },
  ],
  timestamp: new Date().toISOString(),
});

const makeRoutingDecision = (taskId: string): RoutingDecision => ({
  taskId,
  selectedAgentId: "agent-1",
  scores: [
    {
      agentId: "agent-1",
      score: 0.9,
      reasoning: "Good match",
      matchedCriteria: ["language"],
    },
  ],
  confidence: 0.9,
  fallbackChain: [],
  timestamp: new Date().toISOString(),
});

function createMockCallbacks() {
  return {
    onRoute: vi.fn(async (task: Task) => makeRoutingDecision(task.id)),
    onPlan: vi.fn(async () => makePlan()),
    onExecute: vi.fn(async () => makeExecResult()),
    onVerify: vi.fn(async (_task: Task, _result: ExecutionResult) =>
      makeVerificationResult("wf", true)
    ),
  };
}

describe("WorkflowExecutor", () => {
  it("creates a workflow", () => {
    const executor = new WorkflowExecutor(createMockCallbacks());
    const task = makeTask();
    const wf = executor.createWorkflow(task);

    expect(wf.taskId).toBe("task-1");
    expect(wf.phase).toBe("Created");
    expect(wf.id).toMatch(/^wf-/);
  });

  it("runs a workflow through the full lifecycle", async () => {
    const callbacks = createMockCallbacks();
    const executor = new WorkflowExecutor(callbacks);
    const task = makeTask();
    const wf = executor.createWorkflow(task);

    const result = await executor.run(wf.id, task);

    expect(result.phase).toBe("Done");
    expect(result.agentId).toBe("agent-1");
    expect(result.plan).toBeDefined();
    expect(result.executionResult).toBeDefined();
    expect(result.verificationResult).toBeDefined();
    expect(result.routingDecision).toBeDefined();
    expect(callbacks.onRoute).toHaveBeenCalledOnce();
    expect(callbacks.onPlan).toHaveBeenCalledOnce();
    expect(callbacks.onExecute).toHaveBeenCalledOnce();
    expect(callbacks.onVerify).toHaveBeenCalledOnce();
  });

  it("transitions through all phases in order", async () => {
    const executor = new WorkflowExecutor(createMockCallbacks());
    const events: WorkflowEvent[] = [];
    executor.on((e) => events.push(e));

    const task = makeTask();
    const wf = executor.createWorkflow(task);
    await executor.run(wf.id, task);

    const transitions = events
      .filter((e) => e.type === "workflow:transition")
      .map((e) => `${e.data.from} → ${e.data.to}`);

    expect(transitions).toEqual([
      "Created → Planning",
      "Planning → Planned",
      "Planned → Executing",
      "Executing → Executed",
      "Executed → Verifying",
      "Verifying → Verified",
      "Verified → Done",
    ]);
  });

  it("handles execution failure gracefully", async () => {
    const callbacks = createMockCallbacks();
    callbacks.onExecute.mockRejectedValue(new Error("Agent crashed"));

    const executor = new WorkflowExecutor(callbacks);
    const task = makeTask();
    const wf = executor.createWorkflow(task);

    const result = await executor.run(wf.id, task);

    expect(result.phase).toBe("Failed");
    expect(result.error).toBe("Agent crashed");
  });

  it("handles routing failure", async () => {
    const callbacks = createMockCallbacks();
    callbacks.onRoute.mockRejectedValue(new Error("No agents available"));

    const executor = new WorkflowExecutor(callbacks);
    const task = makeTask();
    const wf = executor.createWorkflow(task);

    const result = await executor.run(wf.id, task);

    expect(result.phase).toBe("Failed");
    expect(result.error).toBe("No agents available");
  });

  it("cancels a running workflow", async () => {
    const callbacks = createMockCallbacks();
    // Make onPlan slow so we can cancel during it
    callbacks.onPlan.mockImplementation(
      () => new Promise((r) => setTimeout(() => r(makePlan()), 500))
    );

    const executor = new WorkflowExecutor(callbacks);
    const task = makeTask();
    const wf = executor.createWorkflow(task);

    const runPromise = executor.run(wf.id, task);

    // Cancel after a brief delay
    await new Promise((r) => setTimeout(r, 50));
    executor.cancel(wf.id);

    const result = await runPromise;
    expect(result.phase).toBe("Failed");
  });

  it("tracks multiple workflows independently", async () => {
    const executor = new WorkflowExecutor(createMockCallbacks());
    const wf1 = executor.createWorkflow(makeTask("t1"));
    const wf2 = executor.createWorkflow(makeTask("t2"));

    expect(executor.getAllWorkflows()).toHaveLength(2);
    expect(executor.getWorkflow(wf1.id).taskId).toBe("t1");
    expect(executor.getWorkflow(wf2.id).taskId).toBe("t2");
  });

  it("throws when getting unknown workflow", () => {
    const executor = new WorkflowExecutor(createMockCallbacks());
    expect(() => executor.getWorkflow("nonexistent")).toThrow("not found");
  });
});
