import type { DiscoveredTool } from "./client-types.js";
import type { TaskType } from "@agent-harness/core";

interface ToolIndexEntry {
  tool: DiscoveredTool;
  languages: Set<string>;
  frameworks: Set<string>;
  taskTypes: Set<TaskType>;
}

/**
 * Registry of all discovered MCP tools across servers,
 * indexed by language/framework/task-type for the router.
 */
export class ToolRegistry {
  private entries = new Map<string, ToolIndexEntry>();

  /** Register a discovered tool with its applicability metadata */
  register(
    tool: DiscoveredTool,
    metadata?: {
      languages?: string[];
      frameworks?: string[];
      taskTypes?: TaskType[];
    }
  ): void {
    const key = `${tool.serverName}::${tool.name}`;
    this.entries.set(key, {
      tool,
      languages: new Set(metadata?.languages ?? []),
      frameworks: new Set(metadata?.frameworks ?? []),
      taskTypes: new Set(metadata?.taskTypes ?? []),
    });
  }

  /** Register all tools from a server */
  registerBulk(
    tools: DiscoveredTool[],
    metadata?: {
      languages?: string[];
      frameworks?: string[];
      taskTypes?: TaskType[];
    }
  ): void {
    for (const tool of tools) {
      this.register(tool, metadata);
    }
  }

  /** Remove all tools from a specific server */
  removeServer(serverName: string): void {
    for (const [key, entry] of this.entries) {
      if (entry.tool.serverName === serverName) {
        this.entries.delete(key);
      }
    }
  }

  /** Find tools matching given criteria */
  query(criteria: {
    language?: string;
    framework?: string;
    taskType?: TaskType;
    serverName?: string;
    namePattern?: string;
  }): DiscoveredTool[] {
    const results: DiscoveredTool[] = [];

    for (const entry of this.entries.values()) {
      if (
        criteria.serverName &&
        entry.tool.serverName !== criteria.serverName
      ) {
        continue;
      }
      if (
        criteria.language &&
        entry.languages.size > 0 &&
        !entry.languages.has(criteria.language)
      ) {
        continue;
      }
      if (
        criteria.framework &&
        entry.frameworks.size > 0 &&
        !entry.frameworks.has(criteria.framework)
      ) {
        continue;
      }
      if (
        criteria.taskType &&
        entry.taskTypes.size > 0 &&
        !entry.taskTypes.has(criteria.taskType)
      ) {
        continue;
      }
      if (
        criteria.namePattern &&
        !entry.tool.name
          .toLowerCase()
          .includes(criteria.namePattern.toLowerCase())
      ) {
        continue;
      }

      results.push(entry.tool);
    }

    return results;
  }

  /** Get all registered tools */
  getAll(): DiscoveredTool[] {
    return [...this.entries.values()].map((e) => e.tool);
  }

  /** Get count of registered tools */
  get size(): number {
    return this.entries.size;
  }

  /** Clear all entries */
  clear(): void {
    this.entries.clear();
  }
}
