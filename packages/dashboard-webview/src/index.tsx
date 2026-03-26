import React from "react";
import type {
  WorkflowRun,
  DailyProgress,
  WorkflowPhase,
} from "@agent-harness/core";

const PHASE_COLORS: Record<WorkflowPhase, string> = {
  Created: "#6b7280",
  Planning: "#3b82f6",
  Planned: "#8b5cf6",
  Executing: "#f59e0b",
  Executed: "#f97316",
  Verifying: "#06b6d4",
  Verified: "#10b981",
  Done: "#22c55e",
  Failed: "#ef4444",
};

interface DashboardProps {
  workflows: WorkflowRun[];
  progress: DailyProgress | null;
}

export function Dashboard({ workflows, progress }: DashboardProps) {
  const active = workflows.filter(
    (w) => w.phase !== "Done" && w.phase !== "Failed"
  );
  const completed = workflows.filter((w) => w.phase === "Done").length;

  return (
    <div style={{ padding: "1rem", fontFamily: "var(--vscode-font-family)" }}>
      <h2 style={{ fontSize: "1.2rem", marginBottom: "1rem" }}>
        Agent Harness Dashboard
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "0.75rem",
          marginBottom: "1.5rem",
        }}
      >
        <MetricCard label="Active" value={active.length} color="#f59e0b" />
        <MetricCard label="Completed" value={completed} color="#22c55e" />
        <MetricCard
          label="Pass Rate"
          value={
            progress
              ? `${Math.round(progress.verificationPassRate * 100)}%`
              : "—"
          }
          color="#3b82f6"
        />
      </div>

      <h3 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>
        Recent Workflows
      </h3>
      {workflows.length === 0 ? (
        <p style={{ opacity: 0.5 }}>No workflows yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {workflows.slice(0, 10).map((wf) => (
            <li
              key={wf.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 0",
                borderBottom:
                  "1px solid var(--vscode-editorWidget-border, #333)",
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: PHASE_COLORS[wf.phase],
                }}
              />
              <span style={{ flex: 1 }}>{wf.id}</span>
              <span
                style={{
                  fontSize: "0.8rem",
                  padding: "0.15rem 0.5rem",
                  borderRadius: "0.75rem",
                  background: PHASE_COLORS[wf.phase],
                  color: "#fff",
                }}
              >
                {wf.phase}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div
      style={{
        padding: "1rem",
        borderRadius: "0.5rem",
        background: "var(--vscode-editorWidget-background)",
        border: "1px solid var(--vscode-editorWidget-border)",
      }}
    >
      <div style={{ fontSize: "0.75rem", opacity: 0.6 }}>{label}</div>
      <div style={{ fontSize: "1.5rem", fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

export default Dashboard;
