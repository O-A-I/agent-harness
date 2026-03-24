import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type {
  MCPServerConfig,
  MCPConnectionState,
  MCPConnectionInfo,
  DiscoveredTool,
  ToolInvocationResult,
  ServerManifest,
} from "./client-types.js";

interface ManagedConnection {
  config: MCPServerConfig;
  client: Client;
  transport: StdioClientTransport;
  state: MCPConnectionState;
  tools: DiscoveredTool[];
  lastConnected?: string;
  error?: string;
}

/**
 * Manages connections to multiple MCP servers.
 * Discovers tools, caches manifests, invokes with timeout/retry.
 */
export class MCPClientManager {
  private connections = new Map<string, ManagedConnection>();
  private manifestCache = new Map<string, ServerManifest>();

  /** Connect to an MCP server and discover its tools */
  async connect(config: MCPServerConfig): Promise<DiscoveredTool[]> {
    if (this.connections.has(config.name)) {
      await this.disconnect(config.name);
    }

    const client = new Client(
      { name: "agent-harness", version: "0.1.0" },
      { capabilities: {} }
    );

    if (!config.command) {
      throw new Error(
        `Server "${config.name}": stdio transport requires a command`
      );
    }

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env as Record<string, string> | undefined,
    });

    const conn: ManagedConnection = {
      config,
      client,
      transport,
      state: "connecting",
      tools: [],
    };
    this.connections.set(config.name, conn);

    try {
      await client.connect(transport);
      conn.state = "connected";
      conn.lastConnected = new Date().toISOString();

      // Discover tools
      const toolsResult = await client.listTools();
      conn.tools = (toolsResult.tools || []).map((t) => ({
        name: t.name,
        description: t.description || "",
        serverName: config.name,
        inputSchema: (t.inputSchema as Record<string, unknown>) || {},
      }));

      // Cache manifest
      this.manifestCache.set(config.name, {
        serverName: config.name,
        tools: conn.tools,
        cachedAt: new Date().toISOString(),
      });

      return conn.tools;
    } catch (err) {
      conn.state = "error";
      conn.error = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  /** Disconnect from a specific server */
  async disconnect(serverName: string): Promise<void> {
    const conn = this.connections.get(serverName);
    if (!conn) return;

    try {
      await conn.client.close();
    } catch {
      // Best effort
    }
    conn.state = "disconnected";
    this.connections.delete(serverName);
  }

  /** Disconnect from all servers */
  async disconnectAll(): Promise<void> {
    const names = [...this.connections.keys()];
    await Promise.allSettled(names.map((n) => this.disconnect(n)));
  }

  /** Invoke a tool on a specific server with timeout and retry */
  async invokeTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown> = {},
    options?: { timeoutMs?: number; retries?: number }
  ): Promise<ToolInvocationResult> {
    const conn = this.connections.get(serverName);
    if (!conn || conn.state !== "connected") {
      throw new Error(`Server "${serverName}" is not connected`);
    }

    const timeoutMs = options?.timeoutMs ?? conn.config.timeoutMs ?? 30000;
    const maxRetries = options?.retries ?? conn.config.maxRetries ?? 0;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await Promise.race([
          conn.client.callTool({ name: toolName, arguments: args }),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Tool "${toolName}" timed out after ${timeoutMs}ms`)),
              timeoutMs
            )
          ),
        ]);

        return {
          success: !result.isError,
          content: (result.content as ToolInvocationResult["content"]) || [],
          isError: result.isError as boolean | undefined,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries) {
          // Exponential backoff
          await new Promise((r) => setTimeout(r, 100 * 2 ** attempt));
        }
      }
    }

    throw lastError;
  }

  /** Get connection status for all servers */
  getConnectionInfo(): MCPConnectionInfo[] {
    return [...this.connections.values()].map((conn) => ({
      serverName: conn.config.name,
      state: conn.state,
      toolCount: conn.tools.length,
      lastConnected: conn.lastConnected,
      error: conn.error,
    }));
  }

  /** Get all discovered tools across all connected servers */
  getAllTools(): DiscoveredTool[] {
    const tools: DiscoveredTool[] = [];
    for (const conn of this.connections.values()) {
      tools.push(...conn.tools);
    }
    return tools;
  }

  /** Get cached manifest for a server (available even after disconnect) */
  getCachedManifest(serverName: string): ServerManifest | undefined {
    return this.manifestCache.get(serverName);
  }

  /** Check if a server is connected */
  isConnected(serverName: string): boolean {
    return this.connections.get(serverName)?.state === "connected";
  }
}
