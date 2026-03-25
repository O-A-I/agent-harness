/**
 * Tool Registry — maintains a registry of all discovered MCP tools across servers,
 * indexed by language/framework/task-type for the router to query.
 */

import type { McpTool } from '../client/mcp-client.js';
import type { AgentCapability } from '@agent-harness/core';

export interface ToolRegistryEntry {
  readonly tool: McpTool;
  readonly agentId: string;
  readonly languages: readonly string[];
  readonly frameworks: readonly string[];
  readonly taskTypes: readonly string[];
}

export class ToolRegistry {
  private entries: ToolRegistryEntry[] = [];

  registerAgent(capability: AgentCapability, tools: readonly McpTool[]): void {
    for (const tool of tools) {
      this.entries.push({
        tool,
        agentId: capability.agentId,
        languages: capability.languages,
        frameworks: capability.frameworks,
        taskTypes: capability.taskTypes,
      });
    }
  }

  unregisterAgent(agentId: string): void {
    this.entries = this.entries.filter((e) => e.agentId !== agentId);
  }

  findByLanguage(language: string): readonly ToolRegistryEntry[] {
    return this.entries.filter((e) =>
      e.languages.some((l) => l.toLowerCase() === language.toLowerCase()),
    );
  }

  findByFramework(framework: string): readonly ToolRegistryEntry[] {
    return this.entries.filter((e) =>
      e.frameworks.some((f) => f.toLowerCase() === framework.toLowerCase()),
    );
  }

  findByTaskType(taskType: string): readonly ToolRegistryEntry[] {
    return this.entries.filter((e) =>
      e.taskTypes.some((t) => t.toLowerCase() === taskType.toLowerCase()),
    );
  }

  findForContext(criteria: {
    languages?: readonly string[];
    frameworks?: readonly string[];
    taskTypes?: readonly string[];
  }): readonly ToolRegistryEntry[] {
    return this.entries.filter((entry) => {
      const langMatch =
        !criteria.languages?.length ||
        criteria.languages.some((l) =>
          entry.languages.some((el) => el.toLowerCase() === l.toLowerCase()),
        );
      const fwMatch =
        !criteria.frameworks?.length ||
        criteria.frameworks.some((f) =>
          entry.frameworks.some((ef) => ef.toLowerCase() === f.toLowerCase()),
        );
      const taskMatch =
        !criteria.taskTypes?.length ||
        criteria.taskTypes.some((t) =>
          entry.taskTypes.some((et) => et.toLowerCase() === t.toLowerCase()),
        );
      return langMatch && fwMatch && taskMatch;
    });
  }

  getAllEntries(): readonly ToolRegistryEntry[] {
    return [...this.entries];
  }

  getAgentIds(): readonly string[] {
    return [...new Set(this.entries.map((e) => e.agentId))];
  }

  clear(): void {
    this.entries = [];
  }
}
