/**
 * harness.config.yaml schema — TypeScript types for the repo-scoped configuration file.
 */

export interface HarnessConfig {
  readonly version: 1;
  readonly repo: RepoConfigOverrides;
  readonly agents: AgentPermissions;
  readonly verification: VerificationConfig;
  readonly constraints: ExecutionConstraints;
}

export interface RepoConfigOverrides {
  /** Override auto-detected languages */
  readonly languages?: readonly string[];
  /** Override auto-detected frameworks */
  readonly frameworks?: readonly string[];
  /** Override auto-detected build system */
  readonly buildSystem?: string;
  /** Override auto-detected test framework */
  readonly testFramework?: string;
}

export interface AgentPermissions {
  /** Allowlist of agent IDs permitted for this repo. Empty = allow all. */
  readonly allowed: readonly string[];
  /** Default agent to use when routing is ambiguous */
  readonly default?: string;
}

export interface VerificationConfig {
  /** Which verification checks to run */
  readonly checks: readonly VerificationCheckConfig[];
  /** Custom rules keyed by name */
  readonly rules: Record<string, VerificationRuleConfig>;
  /** Max parallel verification checks */
  readonly parallelism: number;
}

export interface VerificationCheckConfig {
  readonly type: 'compile' | 'type-check' | 'lint' | 'test' | 'git-diff-scope' | 'custom';
  readonly enabled: boolean;
  /** Command to run (for custom checks) */
  readonly command?: string;
  /** Timeout in milliseconds */
  readonly timeout?: number;
}

export interface VerificationRuleConfig {
  readonly enabled: boolean;
  readonly severity: 'error' | 'warning';
  readonly options?: Record<string, unknown>;
}

export interface ExecutionConstraints {
  /** Maximum number of files an agent may modify */
  readonly maxFileChanges: number;
  /** Paths the agent is forbidden from touching (glob patterns) */
  readonly forbiddenPaths: readonly string[];
  /** Maximum execution time in milliseconds */
  readonly timeout: number;
}

export const DEFAULT_CONFIG: HarnessConfig = {
  version: 1,
  repo: {},
  agents: {
    allowed: [],
  },
  verification: {
    checks: [
      { type: 'compile', enabled: true },
      { type: 'type-check', enabled: true },
      { type: 'lint', enabled: true },
      { type: 'test', enabled: true },
      { type: 'git-diff-scope', enabled: true },
    ],
    rules: {},
    parallelism: 4,
  },
  constraints: {
    maxFileChanges: 50,
    forbiddenPaths: ['node_modules/**', '.git/**', '.env*'],
    timeout: 300_000, // 5 minutes
  },
};
