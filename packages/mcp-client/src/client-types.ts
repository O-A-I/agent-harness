/** Configuration for connecting to an MCP server */
export interface MCPServerConfig {
  /** Unique name for this server connection */
  name: string;
  /** Command to launch the server (stdio transport) */
  command?: string;
  /** Arguments to the command */
  args?: string[];
  /** Environment variables for the server process */
  env?: Record<string, string>;
  /** URL for SSE/HTTP transport (alternative to command) */
  url?: string;
  /** Connection timeout in milliseconds */
  timeoutMs?: number;
  /** Maximum retries on connection failure */
  maxRetries?: number;
}

export type MCPConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface MCPConnectionInfo {
  serverName: string;
  state: MCPConnectionState;
  toolCount: number;
  lastConnected?: string;
  error?: string;
}

/** A tool discovered from an MCP server */
export interface DiscoveredTool {
  /** Tool name as reported by the MCP server */
  name: string;
  /** Human-readable description */
  description: string;
  /** The MCP server this tool came from */
  serverName: string;
  /** JSON Schema for the tool's input parameters */
  inputSchema: Record<string, unknown>;
}

/** Result of invoking an MCP tool */
export interface ToolInvocationResult {
  success: boolean;
  content: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/** Manifest cached locally per MCP server */
export interface ServerManifest {
  serverName: string;
  tools: DiscoveredTool[];
  cachedAt: string;
}
