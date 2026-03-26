/**
 * Task Router — accepts a Task, analyzes the repo, scores agents,
 * and returns a RoutingDecision with confidence + reasoning + fallback chain.
 */

import type { Task, AgentCapability, RoutingDecision, RepoProfile } from '@agent-harness/core';
import { analyzeRepo } from './analyzer.js';
import { scoreAgents, type ScoredAgent } from './scorer.js';

export interface RouterOptions {
  /** Minimum confidence threshold. Below this, routing is considered ambiguous. */
  readonly minConfidence?: number;
  /** Repo profile override. If provided, skips repo analysis. */
  readonly repoProfile?: RepoProfile;
  /** Default agent to use when no agent exceeds minConfidence. */
  readonly defaultAgentId?: string;
}

export interface RouterResult {
  readonly decision: RoutingDecision;
  readonly scores: readonly ScoredAgent[];
  readonly repoProfile: RepoProfile;
}

const DEFAULT_MIN_CONFIDENCE = 0.5;

export async function routeTask(
  task: Task,
  agents: readonly AgentCapability[],
  options?: RouterOptions,
): Promise<RouterResult> {
  if (agents.length === 0) {
    throw new Error('No agents available for routing');
  }

  const minConfidence = options?.minConfidence ?? DEFAULT_MIN_CONFIDENCE;

  // Step 1: Analyze repo (or use override)
  const repoProfile = options?.repoProfile ?? (await analyzeRepo(task.repoContext.rootPath));

  // Step 2: Score all agents
  const scores = scoreAgents(task, repoProfile, agents);

  // Step 3: Build routing decision
  const topAgent = scores[0];
  const fallbacks = scores.slice(1, 4).map((s) => s.agentId);

  let selectedAgent = topAgent;
  let reasoning: string;

  if (topAgent.score >= minConfidence) {
    reasoning = buildReasoning(topAgent, repoProfile);
  } else if (options?.defaultAgentId) {
    // Fall back to default agent
    const defaultScore = scores.find((s) => s.agentId === options.defaultAgentId);
    if (defaultScore) {
      selectedAgent = defaultScore;
    }
    reasoning = `No agent exceeded confidence threshold (${minConfidence}). Using default agent.`;
  } else {
    reasoning = `Best match scored ${topAgent.score} (below threshold ${minConfidence}). Proceeding with best available.`;
  }

  const decision: RoutingDecision = {
    agentId: selectedAgent.agentId,
    confidence: selectedAgent.score,
    reasoning,
    fallbackAgents: fallbacks,
    scoredAt: new Date(),
  };

  return { decision, scores, repoProfile };
}

function buildReasoning(agent: ScoredAgent, profile: RepoProfile): string {
  const parts: string[] = [];

  if (agent.breakdown.languageMatch >= 0.8) {
    const langs = profile.languages.map((l) => l.name).join(', ');
    parts.push(`Strong language match (${langs})`);
  }
  if (agent.breakdown.frameworkMatch >= 0.7) {
    parts.push(`Framework match (${profile.frameworks.join(', ')})`);
  }
  if (agent.breakdown.taskTypeMatch >= 0.8) {
    parts.push('Task type alignment');
  }

  if (parts.length === 0) {
    return `Best available agent with score ${agent.score}`;
  }

  return `Selected based on: ${parts.join('; ')}. Confidence: ${agent.score}`;
}
