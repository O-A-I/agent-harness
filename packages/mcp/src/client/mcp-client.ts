/**
 * MCP Client — wraps the MCP protocol for connecting to external MCP servers.
 * Discovers tools/resources/prompts, caches manifests locally,
 * invokes tools with timeout/retry.
 */

export interface McpServerConfig {
  readonly name: string;
  readonly uri: string;
  readonly transport: 'stdio' | 'sse' | 'streamable-http';
  readonly command?: string;
  readonly args?: readonly string[];
  readonly env?: Record<string, string>;
}

export interface McpTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly serverName: string;
}

export interface McpResource {
  readonly uri: string;
  readonly name: string;
  readonly description?: string;
  readonly mimeType?: string;
  readonly serverName: string;
}

export interface McpInvokeOptions {
  readonly timeout?: number;
  readonly retries?: number;
}

export interface McpInvokeResult {
  readonly content: unknown;
  readonly isError: boolean;
  readonly duration: number;
}

/**
 * MCP Client interface.
 * Implementations will wrap @modelcontextprotocol/sdk.
 */
export interface McpClient {
  connect(config: McpServerConfig): Promise<void>;
  disconnect(serverName: string): Promise<void>;
  disconnectAll(): Promise<void>;

  listTools(serverName?: string): Promise<readonly McpTool[]>;
  listResources(serverName?: string): Promise<readonly McpResource[]>;

  invokeTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
    options?: McpInvokeOptions,
  ): Promise<McpInvokeResult>;

  isConnected(serverName: string): boolean;
  getConnectedServers(): readonly string[];
}

/**
 * Stub implementation for development.
 * Replace with real @modelcontextprotocol/sdk wrapper when MCP SDK is added.
 */
export class StubMcpClient implements McpClient {
  private servers = new Map<string, McpServerConfig>();

  async connect(config: McpServerConfig): Promise<void> {
    this.servers.set(config.name, config);
  }

  async disconnect(serverName: string): Promise<void> {
    this.servers.delete(serverName);
  }

  async disconnectAll(): Promise<void> {
    this.servers.clear();
  }

  async listTools(_serverName?: string): Promise<readonly McpTool[]> {
    return [];
  }

  async listResources(_serverName?: string): Promise<readonly McpResource[]> {
    return [];
  }

  async invokeTool(
    serverName: string,
    toolName: string,
    _args: Record<string, unknown>,
    _options?: McpInvokeOptions,
  ): Promise<McpInvokeResult> {
    if (!this.servers.has(serverName)) {
      return { content: null, isError: true, duration: 0 };
    }
    return {
      content: { stub: true, tool: toolName },
      isError: false,
      duration: 0,
    };
  }

  isConnected(serverName: string): boolean {
    return this.servers.has(serverName);
  }

  getConnectedServers(): readonly string[] {
    return Array.from(this.servers.keys());
  }
}
