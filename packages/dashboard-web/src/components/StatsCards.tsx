import React from "react";

interface Metric {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}

interface Props {
  metrics: Metric[];
}

export function StatsCards({ metrics }: Props) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: "1rem",
      }}
    >
      {metrics.map((m) => (
        <div
          key={m.label}
          style={{
            padding: "1.25rem",
            borderRadius: "0.75rem",
            background: "#1e1e2e",
            border: "1px solid #2e2e3e",
          }}
        >
          <div style={{ fontSize: "0.75rem", opacity: 0.6, marginBottom: "0.5rem" }}>
            {m.label}
          </div>
          <div
            style={{
              fontSize: "2rem",
              fontWeight: 700,
              color: m.color ?? "#60a5fa",
              lineHeight: 1,
            }}
          >
            {m.value}
          </div>
          {m.sub && (
            <div style={{ fontSize: "0.75rem", opacity: 0.5, marginTop: "0.35rem" }}>
              {m.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
