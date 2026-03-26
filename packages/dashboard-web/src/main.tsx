import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  api,
  connectLive,
  type WorkflowSummary,
  type AgentStat,
  type VerificationStats,
} from "./api";
import { WorkflowTimeline } from "./components/WorkflowTimeline";
import { AgentHeatmap } from "./components/AgentHeatmap";
import { StatsCards } from "./components/StatsCards";

function App() {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [agents, setAgents] = useState<AgentStat[]>([]);
  const [verifyStats, setVerifyStats] = useState<VerificationStats>({
    total: 0,
    passed: 0,
    failed: 0,
    pass_rate: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");

  const refresh = async () => {
    try {
      const [wfRes, agentRes, vRes] = await Promise.all([
        api.listWorkflows(filter || undefined),
        api.agentStats(),
        api.verificationStats(),
      ]);
      setWorkflows(wfRes.workflows);
      setAgents(agentRes.agents);
      setVerifyStats(vRes);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch data");
    }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);

    // Try to connect live WebSocket (graceful fallback)
    try {
      connectLive(() => refresh());
    } catch {
      // WebSocket not available — polling is fine
    }

    return () => clearInterval(interval);
  }, [filter]);

  const activeCount = workflows.filter(
    (w) => !["Done", "Failed"].includes(w.phase)
  ).length;
  const completedCount = workflows.filter((w) => w.phase === "Done").length;
  const failedCount = workflows.filter((w) => w.phase === "Failed").length;

  return (
    <div
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "2rem",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: "#e0e0e0",
        background: "#0d1117",
        minHeight: "100vh",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "2rem",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>
          🧪 Agent Harness Dashboard
        </h1>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              padding: "0.5rem",
              borderRadius: "0.5rem",
              background: "#1e1e2e",
              color: "#e0e0e0",
              border: "1px solid #2e2e3e",
            }}
          >
            <option value="">All Phases</option>
            {[
              "Created",
              "Planning",
              "Planned",
              "Executing",
              "Executed",
              "Verifying",
              "Verified",
              "Done",
              "Failed",
            ].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button
            onClick={refresh}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              background: "#3b82f6",
              color: "#fff",
              border: "none",
              cursor: "pointer",
            }}
          >
            ↻ Refresh
          </button>
          <button
            onClick={async () => {
              const data = await api.exportData();
              const blob = new Blob([JSON.stringify(data, null, 2)], {
                type: "application/json",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `harness-export-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              background: "#1e1e2e",
              color: "#e0e0e0",
              border: "1px solid #2e2e3e",
              cursor: "pointer",
            }}
          >
            📥 Export
          </button>
        </div>
      </header>

      {error && (
        <div
          style={{
            padding: "1rem",
            background: "#3b1111",
            border: "1px solid #ef4444",
            borderRadius: "0.5rem",
            marginBottom: "1rem",
          }}
        >
          {error}
        </div>
      )}

      <StatsCards
        metrics={[
          {
            label: "Active Workflows",
            value: activeCount,
            color: "#f59e0b",
          },
          {
            label: "Completed",
            value: completedCount,
            color: "#22c55e",
          },
          { label: "Failed", value: failedCount, color: "#ef4444" },
          {
            label: "Verification Rate",
            value: verifyStats.total > 0 ? `${verifyStats.pass_rate}%` : "—",
            sub: verifyStats.total > 0
              ? `${verifyStats.passed}/${verifyStats.total} passed`
              : "no verifications yet",
            color: verifyStats.pass_rate >= 80 ? "#22c55e" : "#f59e0b",
          },
        ]}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: "1.5rem",
          marginTop: "1.5rem",
        }}
      >
        <section>
          <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>
            📋 Workflows
          </h2>
          <WorkflowTimeline workflows={workflows} />
        </section>

        <section>
          <h2 style={{ fontSize: "1.1rem", marginBottom: "0.75rem" }}>
            🤖 Agent Performance
          </h2>
          <AgentHeatmap agents={agents} />
        </section>
      </div>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}

