import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { WorkflowRun, DailyProgress, Id } from "@agent-harness/core";

/** Dependencies injected into the MCP server */
export interface HarnessServerDeps {
  getWorkflows: () => WorkflowRun[];
  getWorkflow: (id: Id) => WorkflowRun | undefined;
  getDailyProgress: (date?: string) => DailyProgress | undefined;
}

const TOOLS = [
  {
    name: "workflow/discover",
    description: "List all available workflows and their current status",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "workflow/status",
    description: "Get the status of a specific workflow by ID",
    inputSchema: {
      type: "object" as const,
      required: ["workflowId"],
      properties: {
        workflowId: { type: "string", description: "The workflow ID" },
      },
    },
  },
  {
    name: "daily/summary",
    description: "Get daily engineering progress summary",
    inputSchema: {
      type: "object" as const,
      properties: {
        date: {
          type: "string",
          description: "Date in YYYY-MM-DD format (defaults to today)",
        },
      },
    },
  },
] as const;

/**
 * MCP Server that exposes Agent Harness capabilities as tools.
 * Enables external agents/clients to query workflow state and progress.
 */
export class HarnessMCPServer {
  private server: Server;
  private deps: HarnessServerDeps;

  constructor(deps: HarnessServerDeps) {
    this.deps = deps;
    this.server = new Server(
      { name: "agent-harness", version: "0.1.0" },
      { capabilities: { tools: {} } }
    );

    this.registerHandlers();
  }

  private registerHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [...TOOLS],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name } = request.params;
      const args = (request.params.arguments ?? {}) as Record<string, unknown>;

      switch (name) {
        case "workflow/discover":
          return this.handleWorkflowDiscover();
        case "workflow/status":
          return this.handleWorkflowStatus(args.workflowId as string);
        case "daily/summary":
          return this.handleDailySummary(args.date as string | undefined);
        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    });
  }

  private handleWorkflowDiscover() {
    const workflows = this.deps.getWorkflows();
    const summary = workflows.map((w) => ({
      id: w.id,
      taskId: w.taskId,
      phase: w.phase,
      agentId: w.agentId,
      updatedAt: w.updatedAt,
    }));

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ workflows: summary, count: summary.length }, null, 2),
        },
      ],
    };
  }

  private handleWorkflowStatus(workflowId: string) {
    if (!workflowId) {
      return {
        content: [{ type: "text" as const, text: "workflowId is required" }],
        isError: true,
      };
    }

    const workflow = this.deps.getWorkflow(workflowId);
    if (!workflow) {
      return {
        content: [
          { type: "text" as const, text: `Workflow "${workflowId}" not found` },
        ],
        isError: true,
      };
    }

    return {
      content: [
        { type: "text" as const, text: JSON.stringify(workflow, null, 2) },
      ],
    };
  }

  private handleDailySummary(date?: string) {
    const progress = this.deps.getDailyProgress(date);
    if (!progress) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No progress data for ${date ?? "today"}`,
          },
        ],
      };
    }

    return {
      content: [
        { type: "text" as const, text: JSON.stringify(progress, null, 2) },
      ],
    };
  }

  /** Start the MCP server on stdio transport */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }

  /** Shut down the server */
  async stop(): Promise<void> {
    await this.server.close();
  }
}
