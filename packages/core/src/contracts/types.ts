// ─── Identifiers ───────────────────────────────────────────────

export type TaskId = string & { readonly __brand: unique symbol };
export type WorkflowId = string & { readonly __brand: unique symbol };
export type AgentId = string & { readonly __brand: unique symbol };

export function taskId(id: string): TaskId {
  return id as TaskId;
}
export function workflowId(id: string): WorkflowId {
  return id as WorkflowId;
}
export function agentId(id: string): AgentId {
  return id as AgentId;
}

// ─── Task ──────────────────────────────────────────────────────

export interface Task {
  readonly id: TaskId;
  readonly title: string;
  readonly description: string;
  readonly source: TaskSource;
  readonly repoContext: RepoContext;
  readonly createdAt: Date;
  readonly metadata: Record<string, unknown>;
}

export type TaskSource =
  | { type: 'manual'; createdBy: string }
  | { type: 'git-branch'; branch: string; remote?: string }
  | { type: 'issue'; provider: string; issueId: string; url?: string };

export interface RepoContext {
  readonly rootPath: string;
  readonly languages: string[];
  readonly frameworks: string[];
  readonly buildSystem?: string;
  readonly testFramework?: string;
  readonly ciConfig?: string;
  readonly packageManager?: string;
}

// ─── Workflow ──────────────────────────────────────────────────

export enum WorkflowPhase {
  Created = 'created',
  Planning = 'planning',
  Planned = 'planned',
  Executing = 'executing',
  Executed = 'executed',
  Verifying = 'verifying',
  Verified = 'verified',
  Done = 'done',
  Failed = 'failed',
}

export interface Workflow {
  readonly id: WorkflowId;
  readonly taskId: TaskId;
  readonly phase: WorkflowPhase;
  readonly routing: RoutingDecision | null;
  readonly verification: VerificationResult | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly events: readonly WorkflowEvent[];
}

export interface WorkflowEvent {
  readonly id: string;
  readonly workflowId: WorkflowId;
  readonly fromPhase: WorkflowPhase;
  readonly toPhase: WorkflowPhase;
  readonly timestamp: Date;
  readonly reason?: string;
  readonly metadata?: Record<string, unknown>;
}

// ─── Routing ───────────────────────────────────────────────────

export interface RoutingDecision {
  readonly agentId: AgentId;
  readonly confidence: number; // 0-1
  readonly reasoning: string;
  readonly fallbackAgents: readonly AgentId[];
  readonly scoredAt: Date;
}

export interface AgentCapability {
  readonly agentId: AgentId;
  readonly name: string;
  readonly description: string;
  readonly languages: readonly string[];
  readonly frameworks: readonly string[];
  readonly taskTypes: readonly string[];
  readonly mcpTools: readonly string[];
}

export interface RepoProfile {
  readonly rootPath: string;
  readonly languages: readonly LanguageInfo[];
  readonly frameworks: readonly string[];
  readonly buildSystem?: string;
  readonly testFramework?: string;
  readonly ciConfig?: string;
  readonly packageManager?: string;
}

export interface LanguageInfo {
  readonly name: string;
  readonly percentage: number; // 0-100
  readonly fileCount: number;
}

// ─── Verification ──────────────────────────────────────────────

export interface VerificationResult {
  readonly passed: boolean;
  readonly checks: readonly VerificationCheck[];
  readonly summary: string;
  readonly verifiedAt: Date;
}

export interface VerificationCheck {
  readonly name: string;
  readonly type: VerificationCheckType;
  readonly passed: boolean;
  readonly message?: string;
  readonly duration?: number; // ms
}

export type VerificationCheckType =
  | 'compile'
  | 'type-check'
  | 'lint'
  | 'test'
  | 'git-diff-scope'
  | 'custom';

// ─── Daily Progress ────────────────────────────────────────────

export interface DailyProgress {
  readonly date: string; // ISO date YYYY-MM-DD
  readonly workflows: readonly WorkflowSummary[];
  readonly totalTasks: number;
  readonly completedTasks: number;
  readonly failedTasks: number;
}

export interface WorkflowSummary {
  readonly workflowId: WorkflowId;
  readonly taskTitle: string;
  readonly phase: WorkflowPhase;
  readonly agentId?: AgentId;
  readonly verification?: VerificationResult;
}
