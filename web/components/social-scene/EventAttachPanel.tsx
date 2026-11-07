"use client";

import { useMemo, useState } from "react";
import type { EventRow } from "@/lib/luma";
import type { EventRole, Visibility } from "@/lib/social-scene";

type Props = {
  events: EventRow[];
  onAttach: (event: EventRow, role: EventRole, visibility: Visibility) => void;
  attachedIds: Set<string>;
};

export default function EventAttachPanel({ events, onAttach, attachedIds }: Props) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState<EventRole>("attending");
  const [visibility, setVisibility] = useState<Visibility>("public");

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return events
      .filter((e) => !attachedIds.has(`${e.id}:${role}`))
      .filter(
        (e) =>
          !qq ||
          e.name.toLowerCase().includes(qq) ||
          (e.city || "").toLowerCase().includes(qq),
      )
      .slice(0, 12);
  }, [events, q, attachedIds, role]);

  return (
    <div className="ss-attach">
      <div className="ss-attach-controls">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="search your scene events…"
          aria-label="search events"
        />
        <select value={role} onChange={(e) => setRole(e.target.value as EventRole)} aria-label="role">
          <option value="attending">attending</option>
          <option value="hosting">hosting</option>
        </select>
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as Visibility)}
          aria-label="visibility"
        >
          <option value="public">public</option>
          <option value="unlisted">unlisted</option>
          <option value="private">private</option>
        </select>
      </div>
      <ul className="ss-attach-list">
        {filtered.length === 0 && (
          <li className="sub">no matching events — add follows on home or change filters.</li>
        )}
        {filtered.map((e) => (
          <li key={e.id}>
            <div>
              <div className="ss-rec-title">{e.name}</div>
              <div className="ss-rec-reason">
                {[e.match_city ?? e.city, e.overlap > 1 ? `${e.overlap} follows` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            <button
              type="button"
              className="crm-btn"
              onClick={() => onAttach(e, role, visibility)}
            >
              attach
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
