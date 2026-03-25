import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../src/index.js';
import { agentId, type AgentCapability } from '@agent-harness/core';
import type { McpTool } from '../src/client/mcp-client.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  const tsAgent: AgentCapability = {
    agentId: agentId('ts-agent'),
    name: 'TypeScript Agent',
    description: 'Handles TS/JS tasks',
    languages: ['typescript', 'javascript'],
    frameworks: ['react', 'next.js'],
    taskTypes: ['bugfix', 'feature'],
    mcpTools: [],
  };

  const pyAgent: AgentCapability = {
    agentId: agentId('py-agent'),
    name: 'Python Agent',
    description: 'Handles Python tasks',
    languages: ['python'],
    frameworks: ['django', 'fastapi'],
    taskTypes: ['bugfix', 'refactor'],
    mcpTools: [],
  };

  const tsTools: McpTool[] = [
    { name: 'ts-lint', description: 'Lint TS files', inputSchema: {}, serverName: 'ts-server' },
    { name: 'ts-test', description: 'Run TS tests', inputSchema: {}, serverName: 'ts-server' },
  ];

  const pyTools: McpTool[] = [
    { name: 'py-lint', description: 'Lint Python files', inputSchema: {}, serverName: 'py-server' },
  ];

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('registers and retrieves tools by language', () => {
    registry.registerAgent(tsAgent, tsTools);
    registry.registerAgent(pyAgent, pyTools);

    const tsResults = registry.findByLanguage('typescript');
    expect(tsResults).toHaveLength(2);
    expect(tsResults.every((e) => e.agentId === 'ts-agent')).toBe(true);

    const pyResults = registry.findByLanguage('python');
    expect(pyResults).toHaveLength(1);
  });

  it('finds tools by framework', () => {
    registry.registerAgent(tsAgent, tsTools);
    const results = registry.findByFramework('react');
    expect(results).toHaveLength(2);
  });

  it('finds tools by task type', () => {
    registry.registerAgent(tsAgent, tsTools);
    registry.registerAgent(pyAgent, pyTools);

    const bugfix = registry.findByTaskType('bugfix');
    expect(bugfix).toHaveLength(3); // 2 TS + 1 PY
  });

  it('finds tools by combined context', () => {
    registry.registerAgent(tsAgent, tsTools);
    registry.registerAgent(pyAgent, pyTools);

    const results = registry.findForContext({
      languages: ['typescript'],
      frameworks: ['react'],
    });
    expect(results).toHaveLength(2);
    expect(results.every((e) => e.agentId === 'ts-agent')).toBe(true);
  });

  it('unregisters an agent', () => {
    registry.registerAgent(tsAgent, tsTools);
    registry.registerAgent(pyAgent, pyTools);

    registry.unregisterAgent('ts-agent');
    expect(registry.getAllEntries()).toHaveLength(1);
    expect(registry.getAgentIds()).toEqual(['py-agent']);
  });

  it('clears all entries', () => {
    registry.registerAgent(tsAgent, tsTools);
    registry.clear();
    expect(registry.getAllEntries()).toHaveLength(0);
  });
});
