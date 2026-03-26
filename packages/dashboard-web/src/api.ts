/** API client for the Agent Harness backend. */

const BASE_URL = "/api";

export interface WorkflowSummary {
  id: string;
  task_id: string;
  phase: string;
  agent_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  transitions: Array<{
    from_phase: string;
    to_phase: string;
    reason: string | null;
    timestamp: string;
  }>;
}

export interface AgentStat {
  agent_id: string;
  total: number;
  completed: number;
  failed: number;
}

export interface VerificationStats {
  total: number;
  passed: number;
  failed: number;
  pass_rate: number;
}

export interface DailyProgress {
  date: string;
  workflows_started: number;
  workflows_completed: number;
  workflows_failed: number;
  tasks_routed: number;
  verifications_run: number;
  verification_pass_rate: number;
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  listWorkflows: (phase?: string) =>
    fetchJSON<{ workflows: WorkflowSummary[]; count: number }>(
      `/workflows${phase ? `?phase=${phase}` : ""}`
    ),

  getWorkflow: (id: string) => fetchJSON<WorkflowSummary>(`/workflows/${id}`),

  agentStats: () => fetchJSON<{ agents: AgentStat[] }>("/stats/agents"),

  verificationStats: () => fetchJSON<VerificationStats>("/stats/verification"),

  progress: (date?: string) =>
    fetchJSON<{ progress: DailyProgress | null }>(
      `/progress${date ? `?date=${date}` : ""}`
    ),

  progressRange: (start: string, end: string) =>
    fetchJSON<{ progress: DailyProgress[] }>(
      `/progress?start_date=${start}&end_date=${end}`
    ),

  exportData: () =>
    fetch(`${BASE_URL}/export`, { method: "POST" }).then((r) => r.json()),
};

/** Live WebSocket connection for real-time updates. */
export function connectLive(
  onEvent: (event: Record<string, unknown>) => void
): WebSocket {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${proto}//${window.location.host}/ws/live`);

  ws.onmessage = (ev) => {
    try {
      onEvent(JSON.parse(ev.data));
    } catch {
      // ignore parse errors
    }
  };

  // Auto-reconnect
  ws.onclose = () => {
    setTimeout(() => connectLive(onEvent), 3000);
  };

  return ws;
}
