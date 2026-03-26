import React from "react";
import type { AgentStat } from "../api";

interface Props {
  agents: AgentStat[];
}

export function AgentHeatmap({ agents }: Props) {
  if (agents.length === 0) {
    return (
      <div style={{ textAlign: "center", opacity: 0.5, padding: "2rem" }}>
        No agent data available yet.
      </div>
    );
  }

  const maxTotal = Math.max(...agents.map((a) => a.total), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {agents.map((agent) => {
        const successRate =
          agent.total > 0
            ? Math.round((agent.completed / agent.total) * 100)
            : 0;
        const hue = successRate > 60 ? 120 : successRate > 30 ? 45 : 0;

        return (
          <div
            key={agent.agent_id}
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
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                {agent.agent_id}
              </div>
              <div
                style={{
                  marginTop: "0.35rem",
                  height: 8,
                  borderRadius: 4,
                  background: "#2e2e3e",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${(agent.total / maxTotal) * 100}%`,
                    height: "100%",
                    borderRadius: 4,
                    background: `hsl(${hue}, 70%, 50%)`,
                    transition: "width 0.3s",
                  }}
                />
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: "0.8rem" }}>
              <div>
                <strong>{agent.total}</strong> tasks
              </div>
              <div style={{ opacity: 0.6 }}>
                {agent.completed} ✓ · {agent.failed} ✗
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
