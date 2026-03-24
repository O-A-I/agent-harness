// ── Core Domain Types ──

/** Unique identifier for tasks, workflows, and agents */
export type Id = string;

/** ISO-8601 timestamp string */
export type Timestamp = string;

// ── Task ──

export type TaskType =
  | "bug-fix"
  | "feature"
  | "refactor"
  | "test"
  | "docs"
  | "review"
  | "custom";

export interface Task {
  id: Id;
  title: string;
  description: string;
  type: TaskType;
  repo: string;
  branch?: string;
  files?: string[];
  metadata?: Record<string, unknown>;
  createdAt: Timestamp;
}

// ── Workflow Phases & State ──

export type WorkflowPhase =
  | "Created"
  | "Planning"
  | "Planned"
  | "Executing"
  | "Executed"
  | "Verifying"
  | "Verified"
  | "Done"
  | "Failed";

export interface WorkflowTransition {
  from: WorkflowPhase;
  to: WorkflowPhase;
  timestamp: Timestamp;
  reason?: string;
}

export interface WorkflowRun {
  id: Id;
  taskId: Id;
  phase: WorkflowPhase;
  agentId?: Id;
  routingDecision?: RoutingDecision;
  plan?: WorkflowPlan;
  executionResult?: ExecutionResult;
  verificationResult?: VerificationResult;
  transitions: WorkflowTransition[];
  error?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface WorkflowPlan {
  steps: PlanStep[];
  reasoning: string;
  estimatedFiles: string[];
}

export interface PlanStep {
  id: Id;
  description: string;
  tool?: string;
  args?: Record<string, unknown>;
  status: "pending" | "running" | "done" | "failed" | "skipped";
}

export interface ExecutionResult {
  stepsCompleted: number;
  stepsTotal: number;
  filesChanged: string[];
  output: string;
  durationMs: number;
}

// ── Agent Capabilities ──

export interface AgentCapability {
  id: Id;
  name: string;
  description: string;
  mcpServer: string;
  tools: string[];
  languages: string[];
  frameworks: string[];
  taskTypes: TaskType[];
  maxFileChanges?: number;
  supportsStreaming?: boolean;
}

// ── Routing ──

export interface RoutingScore {
  agentId: Id;
  score: number;
  reasoning: string;
  matchedCriteria: string[];
}

export interface RoutingDecision {
  taskId: Id;
  selectedAgentId: Id;
  scores: RoutingScore[];
  confidence: number;
  fallbackChain: Id[];
  timestamp: Timestamp;
}

// ── Verification ──

export type VerificationCheckType =
  | "compile"
  | "typecheck"
  | "test"
  | "lint"
  | "diff-scope"
  | "custom";

export interface VerificationCheck {
  type: VerificationCheckType;
  name: string;
  passed: boolean;
  output?: string;
  durationMs: number;
}

export interface VerificationResult {
  workflowId: Id;
  passed: boolean;
  checks: VerificationCheck[];
  timestamp: Timestamp;
}

// ── Daily Progress ──

export interface DailyProgress {
  date: string;
  workflowsStarted: number;
  workflowsCompleted: number;
  workflowsFailed: number;
  tasksRouted: number;
  verificationsRun: number;
  verificationPassRate: number;
  topAgents: Array<{ agentId: Id; tasksHandled: number }>;
}

// ── Repo Profile (for routing) ──

export interface RepoProfile {
  path: string;
  languages: Array<{ name: string; percentage: number }>;
  frameworks: string[];
  buildSystem?: string;
  testFramework?: string;
  ciConfig?: string;
  packageManager?: string;
  analyzedAt: Timestamp;
}

// ── Events ──

export type WorkflowEventType =
  | "workflow:created"
  | "workflow:transition"
  | "workflow:completed"
  | "workflow:failed"
  | "routing:decided"
  | "verification:completed";

export interface WorkflowEvent {
  type: WorkflowEventType;
  workflowId: Id;
  data: Record<string, unknown>;
  timestamp: Timestamp;
}
