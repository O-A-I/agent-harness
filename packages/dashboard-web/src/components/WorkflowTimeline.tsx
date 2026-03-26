import React from "react";
import type { WorkflowSummary } from "../api";

const PHASE_COLORS: Record<string, string> = {
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

interface Props {
  workflows: WorkflowSummary[];
}

export function WorkflowTimeline({ workflows }: Props) {
  if (workflows.length === 0) {
    return (
      <div style={{ textAlign: "center", opacity: 0.5, padding: "2rem" }}>
        No workflows yet. Create a task to get started.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {workflows.map((wf) => (
        <div
          key={wf.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            padding: "0.75rem 1rem",
            borderRadius: "0.5rem",
            background: "#1e1e2e",
            border: "1px solid #2e2e3e",
          }}
        >
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: PHASE_COLORS[wf.phase] ?? "#6b7280",
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{wf.id}</div>
            <div style={{ fontSize: "0.75rem", opacity: 0.6 }}>
              Task: {wf.task_id} · Agent: {wf.agent_id ?? "—"}
            </div>
          </div>
          <div
            style={{
              padding: "0.25rem 0.75rem",
              borderRadius: "1rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              background: PHASE_COLORS[wf.phase] ?? "#6b7280",
              color: "#fff",
            }}
          >
            {wf.phase}
          </div>
          <div style={{ fontSize: "0.75rem", opacity: 0.5, whiteSpace: "nowrap" }}>
            {new Date(wf.updated_at).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}
