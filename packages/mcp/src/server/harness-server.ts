/**
 * MCP Server — exposes Agent Harness capabilities as MCP tools.
 * External agents/tools can call these to interact with the harness.
 */

import type { WorkflowStore } from '@agent-harness/core';
import { workflowId } from '@agent-harness/core';

export interface HarnessMcpServerOptions {
  readonly store: WorkflowStore;
  readonly port?: number;
}

/**
 * Tool definitions the harness exposes via MCP.
 */
export const HARNESS_TOOLS = {
  'workflow/discover': {
    description: 'List available workflows and their current status',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results to return' },
        phase: { type: 'string', description: 'Filter by workflow phase' },
      },
    },
  },
  'workflow/status': {
    description: 'Get the current status of a specific workflow',
    inputSchema: {
      type: 'object',
      properties: {
        workflowId: { type: 'string', description: 'Workflow ID to check' },
      },
      required: ['workflowId'],
    },
  },
  'workflow/events': {
    description: 'Get the event history for a workflow',
    inputSchema: {
      type: 'object',
      properties: {
        workflowId: { type: 'string', description: 'Workflow ID' },
      },
      required: ['workflowId'],
    },
  },
  'daily/summary': {
    description: 'Get daily progress summary',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'ISO date (YYYY-MM-DD). Defaults to today.' },
      },
    },
  },
} as const;

export type HarnessToolName = keyof typeof HARNESS_TOOLS;

/**
 * Tool handler — routes incoming MCP tool calls to the appropriate store queries.
 */
export class HarnessToolHandler {
  constructor(private readonly store: WorkflowStore) {}

  async handle(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    switch (toolName) {
      case 'workflow/discover':
        return this.store.listWorkflows({
          limit: (args['limit'] as number) ?? 20,
          phase: args['phase'] as string | undefined,
        });

      case 'workflow/status': {
        const wfId = args['workflowId'] as string;
        return this.store.getWorkflow(workflowId(wfId));
      }

      case 'workflow/events': {
        const wfId = args['workflowId'] as string;
        return this.store.getEvents(workflowId(wfId));
      }

      case 'daily/summary': {
        const date = (args['date'] as string) ?? new Date().toISOString().split('T')[0];
        return this.store.getDailyProgress(date);
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }
}
