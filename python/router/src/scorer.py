"""Applicability scorer — scores agents against tasks using deterministic heuristics."""

from __future__ import annotations

from .models import (
    AgentCapability,
    RepoProfile,
    RoutingDecision,
    RoutingScore,
    Task,
)


def score_agent(
    task: Task,
    repo: RepoProfile,
    agent: AgentCapability,
) -> RoutingScore:
    """Score a single agent's applicability for a task in a repo context.

    Returns a score between 0.0 and 1.0 with reasoning.
    Scoring is purely deterministic — heuristic pattern matching.
    """
    score = 0.0
    max_score = 0.0
    matched: list[str] = []
    reasons: list[str] = []

    # 1. Task type match (weight: 0.35)
    weight = 0.35
    max_score += weight
    if task.type in agent.task_types:
        score += weight
        matched.append(f"task_type:{task.type.value}")
    else:
        reasons.append(f"agent does not handle {task.type.value} tasks")

    # 2. Language overlap (weight: 0.30)
    weight = 0.30
    max_score += weight
    repo_langs = {lang.name for lang in repo.languages}
    agent_langs = set(agent.languages)
    lang_overlap = repo_langs & agent_langs
    if agent_langs and repo_langs:
        lang_ratio = len(lang_overlap) / max(len(repo_langs), 1)
        score += weight * lang_ratio
        if lang_overlap:
            matched.append(f"languages:{','.join(sorted(lang_overlap))}")
        else:
            reasons.append(
                f"no language overlap (repo: {sorted(repo_langs)}, agent: {sorted(agent_langs)})"
            )
    elif not agent_langs:
        # Agent has no language restriction — give partial credit
        score += weight * 0.5
        matched.append("languages:unrestricted")

    # 3. Framework overlap (weight: 0.20)
    weight = 0.20
    max_score += weight
    repo_fws = set(repo.frameworks)
    agent_fws = set(agent.frameworks)
    fw_overlap = repo_fws & agent_fws
    if agent_fws and repo_fws:
        fw_ratio = len(fw_overlap) / max(len(repo_fws), 1)
        score += weight * fw_ratio
        if fw_overlap:
            matched.append(f"frameworks:{','.join(sorted(fw_overlap))}")
    elif not agent_fws:
        score += weight * 0.5
        matched.append("frameworks:unrestricted")

    # 4. Tool coverage (weight: 0.15)
    weight = 0.15
    max_score += weight
    if agent.tools:
        # More tools = more capable, but with diminishing returns
        tool_score = min(len(agent.tools) / 5.0, 1.0)
        score += weight * tool_score
        if tool_score > 0.5:
            matched.append(f"tools:{len(agent.tools)}")

    # Normalize to 0-1
    final_score = round(score / max_score, 3) if max_score > 0 else 0.0

    reasoning_parts = []
    if matched:
        reasoning_parts.append(f"Matched: {', '.join(matched)}")
    if reasons:
        reasoning_parts.append(f"Gaps: {'; '.join(reasons)}")

    return RoutingScore(
        agent_id=agent.id,
        score=final_score,
        reasoning=". ".join(reasoning_parts) or "No scoring criteria applied",
        matched_criteria=matched,
    )


def route_task(
    task: Task,
    repo: RepoProfile,
    agents: list[AgentCapability],
) -> RoutingDecision:
    """Route a task to the best-fit agent.

    Scores all agents, selects the highest, builds a fallback chain.
    """
    if not agents:
        raise ValueError("No agents available for routing")

    scores = [score_agent(task, repo, agent) for agent in agents]
    scores.sort(key=lambda s: s.score, reverse=True)

    selected = scores[0]
    fallback_chain = [s.agent_id for s in scores[1:] if s.score > 0.3]

    # Confidence is the gap between #1 and #2 (if exists)
    if len(scores) >= 2:
        gap = selected.score - scores[1].score
        confidence = round(min(selected.score, 0.5 + gap), 3)
    else:
        confidence = round(selected.score, 3)

    return RoutingDecision(
        task_id=task.id,
        selected_agent_id=selected.agent_id,
        scores=scores,
        confidence=confidence,
        fallback_chain=fallback_chain,
    )
