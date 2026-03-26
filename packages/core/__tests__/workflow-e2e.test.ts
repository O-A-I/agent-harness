import { describe, it, expect, vi } from "vitest";
import { WorkflowExecutor } from "../src/workflow-executor.js";
import {
  WorkflowStateMachine,
  InvalidTransitionError,
} from "../src/state-machine.js";
import type {
  Task,
  WorkflowPlan,
  ExecutionResult,
  VerificationResult,
  RoutingDecision,
  WorkflowEvent,
  VerificationCheck,
} from "../src/types.js";

/**
 * End-to-end workflow test: simulates the full lifecycle
 * Plan → Execute → Verify → Done with realistic callbacks.
 */

const makeTask = (overrides?: Partial<Task>): Task => ({
  id: `task-${Date.now()}`,
  title: "Add user search endpoint",
  description: "Implement GET /api/users/search with query params",
  type: "feature",
  repo: "/workspace/my-api",
  branch: "feature/user-search",
  files: ["src/routes/users.ts", "src/services/search.ts"],
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe("Workflow E2E", () => {
  it("runs a complete task through Plan→Execute→Verify→Done", async () => {
    const events: WorkflowEvent[] = [];

    const executor = new WorkflowExecutor({
      onRoute: async (task) => ({
        taskId: task.id,
        selectedAgentId: "copilot-agent",
        scores: [
          {
            agentId: "copilot-agent",
            score: 0.92,
            reasoning: "Language match (TS), framework match (express), task type match",
            matchedCriteria: ["language:typescript", "framework:express", "task_type:feature"],
          },
          {
            agentId: "generic-agent",
            score: 0.45,
            reasoning: "Partial match, no framework specialization",
            matchedCriteria: ["task_type:feature"],
          },
        ],
        confidence: 0.87,
        fallbackChain: ["generic-agent"],
        timestamp: new Date().toISOString(),
      }),

      onPlan: async (task, agentId) => {
        expect(agentId).toBe("copilot-agent");
        return {
          steps: [
            { id: "s1", description: "Create search service", tool: "edit_file", status: "pending" as const },
            { id: "s2", description: "Add route handler", tool: "edit_file", status: "pending" as const },
            { id: "s3", description: "Write tests", tool: "edit_file", status: "pending" as const },
            { id: "s4", description: "Run tests", tool: "run_test", status: "pending" as const },
          ],
          reasoning: "Need search service, route handler, and tests",
          estimatedFiles: ["src/services/search.ts", "src/routes/users.ts", "tests/search.test.ts"],
        };
      },

      onExecute: async (task, plan, agentId) => {
        expect(plan.steps).toHaveLength(4);
        expect(agentId).toBe("copilot-agent");
        return {
          stepsCompleted: 4,
          stepsTotal: 4,
          filesChanged: ["src/services/search.ts", "src/routes/users.ts", "tests/search.test.ts"],
          output: "All steps completed successfully. 3 files created/modified.",
          durationMs: 12500,
        };
      },

      onVerify: async (task, result) => {
        expect(result.stepsCompleted).toBe(4);
        expect(result.filesChanged).toHaveLength(3);

        const checks: VerificationCheck[] = [
          { type: "compile", name: "TypeScript compile", passed: true, output: "0 errors", durationMs: 1200 },
          { type: "typecheck", name: "Type check", passed: true, output: "No errors", durationMs: 800 },
          { type: "test", name: "Vitest", passed: true, output: "3 tests passed", durationMs: 2100 },
          { type: "lint", name: "ESLint", passed: true, output: "0 warnings", durationMs: 600 },
          { type: "diff-scope", name: "Diff scope", passed: true, output: "3 files changed, all in scope", durationMs: 50 },
        ];

        return {
          workflowId: "will-be-set",
          passed: true,
          checks,
          timestamp: new Date().toISOString(),
        };
      },
    });

    executor.on((e) => events.push(e));

    const task = makeTask();
    const wf = executor.createWorkflow(task);
    const result = await executor.run(wf.id, task);

    // Verify final state
    expect(result.phase).toBe("Done");
    expect(result.agentId).toBe("copilot-agent");
    expect(result.error).toBeUndefined();

    // Verify routing
    expect(result.routingDecision).toBeDefined();
    expect(result.routingDecision!.confidence).toBe(0.87);
    expect(result.routingDecision!.scores).toHaveLength(2);
    expect(result.routingDecision!.fallbackChain).toEqual(["generic-agent"]);

    // Verify plan
    expect(result.plan).toBeDefined();
    expect(result.plan!.steps).toHaveLength(4);

    // Verify execution
    expect(result.executionResult).toBeDefined();
    expect(result.executionResult!.stepsCompleted).toBe(4);
    expect(result.executionResult!.filesChanged).toHaveLength(3);
    expect(result.executionResult!.durationMs).toBe(12500);

    // Verify verification
    expect(result.verificationResult).toBeDefined();
    expect(result.verificationResult!.passed).toBe(true);
    expect(result.verificationResult!.checks).toHaveLength(5);

    // Verify event stream
    const transitionEvents = events.filter((e) => e.type === "workflow:transition");
    expect(transitionEvents).toHaveLength(7); // Created→...→Done

    const phases = transitionEvents.map((e) => e.data.to);
    expect(phases).toEqual([
      "Planning", "Planned", "Executing", "Executed", "Verifying", "Verified", "Done",
    ]);

    // Should have routing and completion events
    expect(events.some((e) => e.type === "routing:decided")).toBe(true);
    expect(events.some((e) => e.type === "workflow:completed")).toBe(true);
    expect(events.some((e) => e.type === "workflow:created")).toBe(true);
  });

  it("fails verification and transitions to Failed", async () => {
    const executor = new WorkflowExecutor({
      onRoute: async (task) => ({
        taskId: task.id,
        selectedAgentId: "agent-1",
        scores: [{ agentId: "agent-1", score: 0.8, reasoning: "ok", matchedCriteria: [] }],
        confidence: 0.8,
        fallbackChain: [],
        timestamp: new Date().toISOString(),
      }),
      onPlan: async () => ({
        steps: [{ id: "s1", description: "Edit", status: "pending" as const }],
        reasoning: "Quick fix",
        estimatedFiles: ["src/main.ts"],
      }),
      onExecute: async () => ({
        stepsCompleted: 1,
        stepsTotal: 1,
        filesChanged: ["src/main.ts"],
        output: "Done",
        durationMs: 500,
      }),
      onVerify: async () => {
        throw new Error("Tests failed: 2 assertions failed");
      },
    });

    const task = makeTask({ type: "bug-fix" });
    const wf = executor.createWorkflow(task);
    const result = await executor.run(wf.id, task);

    expect(result.phase).toBe("Failed");
    expect(result.error).toBe("Tests failed: 2 assertions failed");
    // Should have gotten through execute before failing
    expect(result.executionResult).toBeDefined();
  });

  it("tracks multiple concurrent workflows", async () => {
    const callOrder: string[] = [];

    const executor = new WorkflowExecutor({
      onRoute: async (task) => {
        callOrder.push(`route:${task.id}`);
        return {
          taskId: task.id,
          selectedAgentId: "agent-1",
          scores: [{ agentId: "agent-1", score: 0.9, reasoning: "ok", matchedCriteria: [] }],
          confidence: 0.9,
          fallbackChain: [],
          timestamp: new Date().toISOString(),
        };
      },
      onPlan: async (task) => {
        callOrder.push(`plan:${task.id}`);
        return { steps: [], reasoning: "noop", estimatedFiles: [] };
      },
      onExecute: async (task) => {
        callOrder.push(`exec:${task.id}`);
        return { stepsCompleted: 0, stepsTotal: 0, filesChanged: [], output: "", durationMs: 0 };
      },
      onVerify: async (task) => {
        callOrder.push(`verify:${task.id}`);
        return { workflowId: "", passed: true, checks: [], timestamp: new Date().toISOString() };
      },
    });

    const task1 = makeTask({ id: "task-A", title: "Task A" });
    const task2 = makeTask({ id: "task-B", title: "Task B" });

    const wf1 = executor.createWorkflow(task1);
    const wf2 = executor.createWorkflow(task2);

    const [result1, result2] = await Promise.all([
      executor.run(wf1.id, task1),
      executor.run(wf2.id, task2),
    ]);

    expect(result1.phase).toBe("Done");
    expect(result2.phase).toBe("Done");
    expect(executor.getAllWorkflows()).toHaveLength(2);

    // Both tasks should have been routed, planned, executed, and verified
    expect(callOrder.filter((c) => c.startsWith("route:"))).toHaveLength(2);
    expect(callOrder.filter((c) => c.startsWith("verify:"))).toHaveLength(2);
  });

  it("state machine rejects skipping phases", () => {
    const sm = new WorkflowStateMachine("wf-skip");

    // Can't skip from Created to Executing
    expect(() => sm.transition("Executing")).toThrow(InvalidTransitionError);
    expect(() => sm.transition("Done")).toThrow(InvalidTransitionError);
    expect(() => sm.transition("Verified")).toThrow(InvalidTransitionError);

    // Must follow the path
    sm.transition("Planning");
    expect(() => sm.transition("Executing")).toThrow(InvalidTransitionError);

    sm.transition("Planned");
    sm.transition("Executing");
    expect(sm.phase).toBe("Executing");
  });
});
