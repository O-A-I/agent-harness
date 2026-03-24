import type { RoutingDecision, Task, AgentCapability, RepoProfile } from "@agent-harness/core";

const DEFAULT_PORT = 8321;
const HEALTH_CHECK_INTERVAL_MS = 10000;
const STARTUP_TIMEOUT_MS = 15000;

export interface PythonBridgeConfig {
  pythonPath?: string;
  port?: number;
  host?: string;
}

/**
 * TS↔Python bridge: spawns the FastAPI backend as a child process,
 * communicates via localhost HTTP, with health check and auto-restart.
 */
export class PythonBridge {
  private process: ReturnType<typeof import("child_process").spawn> | null = null;
  private port: number;
  private host: string;
  private pythonPath: string;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private _isRunning = false;

  constructor(private config: PythonBridgeConfig = {}) {
    this.port = config.port ?? DEFAULT_PORT;
    this.host = config.host ?? "127.0.0.1";
    this.pythonPath = config.pythonPath ?? "python3";
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  get baseUrl(): string {
    return `http://${this.host}:${this.port}`;
  }

  /** Start the Python backend process */
  async start(): Promise<void> {
    if (this._isRunning) return;

    const { spawn } = await import("child_process");

    this.process = spawn(
      this.pythonPath,
      [
        "-m",
        "uvicorn",
        "server.src.app:app",
        "--host",
        this.host,
        "--port",
        String(this.port),
        "--no-access-log",
      ],
      {
        cwd: this.findPythonRoot(),
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    this.process.on("exit", (code) => {
      this._isRunning = false;
      if (code !== 0 && code !== null) {
        // Auto-restart on unexpected exit
        setTimeout(() => this.start(), 2000);
      }
    });

    // Wait for the server to be ready
    await this.waitForHealthy(STARTUP_TIMEOUT_MS);
    this._isRunning = true;

    // Start periodic health checks
    this.healthCheckTimer = setInterval(async () => {
      try {
        await this.healthCheck();
      } catch {
        this._isRunning = false;
        this.stop();
        setTimeout(() => this.start(), 2000);
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  /** Stop the Python backend */
  async stop(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
    }
    this._isRunning = false;
  }

  /** Route a task through the Python backend */
  async routeTask(
    task: Task,
    agents: AgentCapability[],
    repoPath?: string,
    repoProfile?: RepoProfile
  ): Promise<RoutingDecision> {
    const response = await fetch(`${this.baseUrl}/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task,
        agents: agents.map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          mcp_server: a.mcpServer,
          tools: a.tools,
          languages: a.languages,
          frameworks: a.frameworks,
          task_types: a.taskTypes,
        })),
        repo_path: repoPath,
        repo_profile: repoProfile,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Routing failed (${response.status}): ${detail}`);
    }

    return (await response.json()) as RoutingDecision;
  }

  /** Analyze a repo through the Python backend */
  async analyzeRepo(repoPath: string): Promise<RepoProfile> {
    const response = await fetch(
      `${this.baseUrl}/analyze?repo_path=${encodeURIComponent(repoPath)}`,
      { method: "POST" }
    );

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Analysis failed (${response.status}): ${detail}`);
    }

    return (await response.json()) as RepoProfile;
  }

  /** Health check */
  async healthCheck(): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) throw new Error("Health check failed");
    return true;
  }

  private async waitForHealthy(timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        await this.healthCheck();
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw new Error(`Python backend did not become healthy within ${timeoutMs}ms`);
  }

  private findPythonRoot(): string {
    // Walk up from __dirname to find the python/ directory
    const path = require("path");
    let dir = __dirname;
    for (let i = 0; i < 10; i++) {
      const candidate = path.join(dir, "python");
      try {
        require("fs").statSync(candidate);
        return candidate;
      } catch {
        dir = path.dirname(dir);
      }
    }
    return path.join(__dirname, "..", "..", "..", "python");
  }
}
