"use client";

import type { AutonomyLevel, AgentBinding } from "@/lib/social-scene";

const LEVELS: { id: AutonomyLevel; label: string; blurb: string }[] = [
  { id: "suggest", label: "suggest", blurb: "recommendations only" },
  { id: "draft", label: "draft", blurb: "agents prepare; you send" },
  { id: "supervised", label: "supervised", blurb: "auto within caps + notify" },
  { id: "autonomous", label: "autonomous", blurb: "budgeted BD loops" },
];

type Props = {
  agent: AgentBinding;
  onChange: (autonomy: AutonomyLevel) => void;
};

export default function AutonomyControls({ agent, onChange }: Props) {
  return (
    <div className="ss-autonomy" role="group" aria-label="agent autonomy">
      <div className="ss-autonomy-label">
        {agent.label} · autonomy
      </div>
      <div className="ss-autonomy-levels">
        {LEVELS.map((l) => (
          <button
            key={l.id}
            type="button"
            className={`ss-autonomy-btn${agent.autonomy === l.id ? " on" : ""}`}
            onClick={() => onChange(l.id)}
            title={l.blurb}
          >
            {l.label}
          </button>
        ))}
      </div>
      <p className="ss-autonomy-blurb">
        {LEVELS.find((l) => l.id === agent.autonomy)?.blurb}. max {agent.maxActionsPerDay}/day ·
        ceiling {agent.dataCeiling}.
      </p>
    </div>
  );
}
