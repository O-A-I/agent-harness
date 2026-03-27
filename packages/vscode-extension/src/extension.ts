import * as vscode from "vscode";
import { PythonBridge } from "./python-bridge.js";
import type { Task, TaskType, WorkflowRun } from "@agent-harness/core";

let pythonBridge: PythonBridge | undefined;
let statusBarItem: vscode.StatusBarItem;
let workflowTreeProvider: WorkflowTreeProvider;

export function activate(context: vscode.ExtensionContext): void {
  pythonBridge = new PythonBridge();

  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.text = "$(beaker) Harness: Ready";
  statusBarItem.tooltip = "Agent Harness — click for options";
  statusBarItem.command = "agentHarness.showMenu";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Tree view
  workflowTreeProvider = new WorkflowTreeProvider();
  const treeView = vscode.window.createTreeView("agentHarnessWorkflows", {
    treeDataProvider: workflowTreeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand("agentHarness.newTask", () =>
      createTask()
    ),
    vscode.commands.registerCommand("agentHarness.showMenu", showMenu),
    vscode.commands.registerCommand("agentHarness.startBackend", startBackend),
    vscode.commands.registerCommand("agentHarness.stopBackend", stopBackend),
    vscode.commands.registerCommand("agentHarness.openDashboard", () =>
      openDashboard()
    )
  );

  // Auto-start backend if harness.config.yaml exists
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceRoot) {
    const configUri = vscode.Uri.joinPath(
      vscode.Uri.file(workspaceRoot),
      "harness.config.yaml"
    );
    vscode.workspace.fs.stat(configUri).then(
      () => startBackend(),
      () => {} // No config file, don't auto-start
    );
  }
}

export function deactivate(): void {
  pythonBridge?.stop();
}

// ── Commands ──

async function createTask(): Promise<void> {
  const taskTypes: TaskType[] = [
    "bug-fix",
    "feature",
    "refactor",
    "test",
    "docs",
    "review",
    "custom",
  ];

  const taskType = await vscode.window.showQuickPick(taskTypes, {
    placeHolder: "Select task type",
    title: "Harness: New Task",
  });
  if (!taskType) return;

  const title = await vscode.window.showInputBox({
    prompt: "Task title",
    placeHolder: "e.g., Fix login validation bug",
  });
  if (!title) return;

  const description = await vscode.window.showInputBox({
    prompt: "Task description",
    placeHolder: "Describe what needs to be done",
  });
  if (!description) return;

  const repo =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "unknown";

  const task: Task = {
    id: `task-${Date.now()}`,
    title,
    description,
    type: taskType as TaskType,
    repo,
    createdAt: new Date().toISOString(),
  };

  updateStatusBar("Planning");
  vscode.window.showInformationMessage(
    `Harness: Task "${task.title}" (${task.id}) created and routing...`
  );
}

async function showMenu(): Promise<void> {
  const items = [
    { label: "$(add) New Task", command: "agentHarness.newTask" },
    {
      label: "$(dashboard) Open Dashboard",
      command: "agentHarness.openDashboard",
    },
    { label: "$(play) Start Backend", command: "agentHarness.startBackend" },
    {
      label: "$(debug-stop) Stop Backend",
      command: "agentHarness.stopBackend",
    },
  ];

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "Agent Harness",
  });

  if (selected) {
    vscode.commands.executeCommand(selected.command);
  }
}

async function startBackend(): Promise<void> {
  if (!pythonBridge) return;
  try {
    await pythonBridge.start();
    updateStatusBar("Ready");
    vscode.window.showInformationMessage("Harness: Backend started");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(
      `Harness: Failed to start backend — ${msg}`
    );
    updateStatusBar("Error");
  }
}

async function stopBackend(): Promise<void> {
  await pythonBridge?.stop();
  updateStatusBar("Stopped");
}

function openDashboard(): void {
  const panel = vscode.window.createWebviewPanel(
    "agentHarnessDashboard",
    "Agent Harness Dashboard",
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  panel.webview.html = getDashboardHtml();
}

// ── Status Bar ──

type StatusBarState =
  | "Ready"
  | "Planning"
  | "Executing"
  | "Verifying"
  | "Done"
  | "Failed"
  | "Stopped"
  | "Error";

const STATUS_ICONS: Record<StatusBarState, string> = {
  Ready: "$(beaker)",
  Planning: "$(loading~spin)",
  Executing: "$(play)",
  Verifying: "$(checklist)",
  Done: "$(pass)",
  Failed: "$(error)",
  Stopped: "$(debug-stop)",
  Error: "$(warning)",
};

function updateStatusBar(state: StatusBarState): void {
  statusBarItem.text = `${STATUS_ICONS[state]} Harness: ${state}`;
}

// ── Tree View ──

class WorkflowTreeProvider
  implements vscode.TreeDataProvider<WorkflowTreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    WorkflowTreeItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private workflows: WorkflowRun[] = [];

  refresh(workflows: WorkflowRun[]): void {
    this.workflows = workflows;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: WorkflowTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): WorkflowTreeItem[] {
    return this.workflows.map(
      (wf) =>
        new WorkflowTreeItem(
          wf.id,
          wf.phase,
          vscode.TreeItemCollapsibleState.None
        )
    );
  }
}

class WorkflowTreeItem extends vscode.TreeItem {
  constructor(
    public readonly workflowId: string,
    public readonly phase: string,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(`${workflowId} — ${phase}`, collapsibleState);
    this.tooltip = `Workflow: ${workflowId}\nPhase: ${phase}`;
    this.iconPath = new vscode.ThemeIcon(
      phase === "Done"
        ? "pass"
        : phase === "Failed"
          ? "error"
          : "loading~spin"
    );
  }
}

// ── Dashboard HTML ──

function getDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Harness Dashboard</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 16px; }
    h1 { font-size: 1.4em; margin-bottom: 16px; }
    .card { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-editorWidget-border); border-radius: 6px; padding: 16px; margin-bottom: 12px; }
    .card h2 { font-size: 1.1em; margin: 0 0 8px 0; }
    .metric { font-size: 2em; font-weight: bold; color: var(--vscode-charts-blue); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid var(--vscode-editorWidget-border); }
  </style>
</head>
<body>
  <h1>Agent Harness Dashboard</h1>
  <div class="grid">
    <div class="card"><h2>Today's Progress</h2><div class="metric" id="tasks-completed">0</div><div>tasks completed</div></div>
    <div class="card"><h2>Verification Rate</h2><div class="metric" id="verify-rate">—</div><div>pass rate</div></div>
    <div class="card"><h2>Active Workflows</h2><div class="metric" id="active-count">0</div><div>in progress</div></div>
  </div>
  <div class="card">
    <h2>Recent Workflows</h2>
    <table>
      <thead><tr><th>Task</th><th>Agent</th><th>Phase</th><th>Time</th></tr></thead>
      <tbody id="workflow-table">
        <tr><td colspan="4" style="text-align:center;opacity:0.6;">No workflows yet. Create a task to get started.</td></tr>
      </tbody>
    </table>
  </div>
  <div class="card"><h2>Routing Insights</h2><p style="opacity:0.6;">Agent routing analytics will appear here once tasks are processed.</p></div>
  <script>
    const vscode = acquireVsCodeApi();
    window.addEventListener('message', event => {
      const { type, data } = event.data;
      if (type === 'update') {
        document.getElementById('tasks-completed').textContent = data.completed || 0;
        document.getElementById('active-count').textContent = data.active || 0;
        document.getElementById('verify-rate').textContent = data.verifyRate !== undefined ? data.verifyRate + '%' : '—';
      }
    });
  </script>
</body>
</html>`;
}
