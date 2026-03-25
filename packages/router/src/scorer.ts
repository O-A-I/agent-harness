/**
 * Applicability Scorer — given a Task + RepoProfile + AgentCapability[],
 * scores each agent (0-1) using deterministic heuristics (pattern matching).
 */

import type { Task, RepoProfile, AgentCapability, AgentId } from '@agent-harness/core';

export interface ScoredAgent {
  readonly agentId: AgentId;
  readonly score: number; // 0-1
  readonly breakdown: ScoreBreakdown;
}

export interface ScoreBreakdown {
  readonly languageMatch: number;
  readonly frameworkMatch: number;
  readonly taskTypeMatch: number;
  readonly toolAvailability: number;
}

// Weights for each scoring dimension
const WEIGHTS = {
  language: 0.40,
  framework: 0.25,
  taskType: 0.25,
  tools: 0.10,
} as const;

export function scoreAgents(
  task: Task,
  profile: RepoProfile,
  agents: readonly AgentCapability[],
): ScoredAgent[] {
  return agents
    .map((agent) => scoreAgent(task, profile, agent))
    .sort((a, b) => b.score - a.score);
}

function scoreAgent(task: Task, profile: RepoProfile, agent: AgentCapability): ScoredAgent {
  const breakdown: ScoreBreakdown = {
    languageMatch: scoreLanguageMatch(profile, agent),
    frameworkMatch: scoreFrameworkMatch(profile, agent),
    taskTypeMatch: scoreTaskTypeMatch(task, agent),
    toolAvailability: agent.mcpTools.length > 0 ? 1.0 : 0.5,
  };

  const score =
    breakdown.languageMatch * WEIGHTS.language +
    breakdown.frameworkMatch * WEIGHTS.framework +
    breakdown.taskTypeMatch * WEIGHTS.taskType +
    breakdown.toolAvailability * WEIGHTS.tools;

  return {
    agentId: agent.agentId,
    score: Math.round(score * 100) / 100, // 2 decimal places
    breakdown,
  };
}

function scoreLanguageMatch(profile: RepoProfile, agent: AgentCapability): number {
  if (profile.languages.length === 0) return 0.5; // unknown repo
  if (agent.languages.length === 0) return 0.3; // agent claims no language specialty

  const repoLangs = profile.languages.map((l) => l.name.toLowerCase());
  const agentLangs = agent.languages.map((l) => l.toLowerCase());

  // Check primary language (highest file count)
  const primaryLang = repoLangs[0];
  if (agentLangs.includes(primaryLang)) return 1.0;

  // Check any overlap
  const overlap = repoLangs.filter((l) => agentLangs.includes(l));
  if (overlap.length > 0) return 0.6;

  return 0.0;
}

function scoreFrameworkMatch(profile: RepoProfile, agent: AgentCapability): number {
  if (profile.frameworks.length === 0) return 0.5;
  if (agent.frameworks.length === 0) return 0.3;

  const repoFw = profile.frameworks.map((f) => f.toLowerCase());
  const agentFw = agent.frameworks.map((f) => f.toLowerCase());

  const overlap = repoFw.filter((f) => agentFw.includes(f));
  if (overlap.length === repoFw.length) return 1.0;
  if (overlap.length > 0) return 0.7;

  return 0.0;
}

function scoreTaskTypeMatch(task: Task, agent: AgentCapability): number {
  if (agent.taskTypes.length === 0) return 0.3;

  // Extract task type from title/description using simple keyword matching
  const taskText = `${task.title} ${task.description}`.toLowerCase();
  const agentTypes = agent.taskTypes.map((t) => t.toLowerCase());

  for (const taskType of agentTypes) {
    if (taskText.includes(taskType)) return 1.0;
  }

  // Check common synonyms
  const synonyms: Record<string, string[]> = {
    bugfix: ['bug', 'fix', 'error', 'issue', 'crash', 'broken'],
    feature: ['add', 'new', 'implement', 'create', 'build'],
    refactor: ['refactor', 'clean', 'restructure', 'improve', 'optimize'],
    test: ['test', 'coverage', 'spec'],
    docs: ['doc', 'readme', 'documentation'],
  };

  for (const taskType of agentTypes) {
    const syns = synonyms[taskType] ?? [];
    if (syns.some((s) => taskText.includes(s))) return 0.8;
  }

  return 0.2;
}
