"use client";

import { useEffect, useState } from "react";
import type { EventRole, Visibility } from "@/lib/social-scene";
import type { EventProviderId, NormalizedEvent, ProviderStatus } from "@/lib/providers/types";
import { normalizedToSceneRef } from "@/lib/providers/to-scene-ref";
import type { SceneEventRef } from "@/lib/social-scene/types";

type Props = {
  city?: string;
  onAttach?: (ref: SceneEventRef) => void;
};

export default function ProviderEventBrowser({ city, onAttach }: Props) {
  const [statuses, setStatuses] = useState<ProviderStatus[]>([]);
  const [provider, setProvider] = useState<EventProviderId | "all">("all");
  const [keyword, setKeyword] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<NormalizedEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<EventRole>("attending");
  const [visibility, setVisibility] = useState<Visibility>("public");

  useEffect(() => {
    fetch("/api/providers")
      .then((r) => r.json())
      .then((d) => setStatuses(d.providers ?? []))
      .catch(() => setStatuses([]));
  }, []);

  const search = async () => {
    setBusy(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        provider,
        limit: "12",
      });
      if (city) qs.set("city", city);
      if (keyword.trim()) qs.set("keyword", keyword.trim());
      const r = await fetch(`/api/providers/events?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "search failed");
      setEvents(d.events ?? []);
      if (!(d.events ?? []).length) setError("no events — check provider keys or try a URL");
    } catch (e: any) {
      setError(e?.message || "search failed");
      setEvents([]);
    } finally {
      setBusy(false);
    }
  };

  const resolveUrl = async () => {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ url: url.trim() });
      const r = await fetch(`/api/providers/events?${qs}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "resolve failed");
      setEvents(d.events ?? []);
    } catch (e: any) {
      setError(e?.message || "resolve failed");
      setEvents([]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ss-provider-browser">
      <div className="ss-provider-status">
        {statuses.map((p) => (
          <span
            key={p.id}
            className={`ss-chip${p.configured ? " on" : ""}`}
            title={p.blurb}
          >
            {p.label}
            {!p.configured && p.envHint ? " · key" : ""}
          </span>
        ))}
      </div>

      <div className="ss-attach-controls">
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as EventProviderId | "all")}
          aria-label="provider"
        >
          <option value="all">all configured</option>
          <option value="ticketmaster">Ticketmaster</option>
          <option value="eventbrite">Eventbrite (org)</option>
          <option value="partiful">Partiful (RSVPs)</option>
        </select>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={city ? `keyword in ${city}` : "keyword"}
          aria-label="keyword"
        />
        <button type="button" className="crm-btn" onClick={search} disabled={busy}>
          {busy ? "…" : "search"}
        </button>
      </div>

      <div className="ss-attach-controls">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="paste Ticketmaster / Eventbrite / Partiful event URL"
          aria-label="event url"
        />
        <select value={role} onChange={(e) => setRole(e.target.value as EventRole)}>
          <option value="attending">attending</option>
          <option value="hosting">hosting</option>
        </select>
        <select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
          <option value="public">public</option>
          <option value="unlisted">unlisted</option>
          <option value="private">private</option>
        </select>
        <button type="button" className="crm-btn ghost" onClick={resolveUrl} disabled={busy}>
          resolve URL
        </button>
      </div>

      {error && <p className="cal-error">{error}</p>}

      <ul className="ss-attach-list">
        {events.map((e) => (
          <li key={e.id}>
            <div>
              <div className="ss-rec-kind">{e.provider}</div>
              <div className="ss-rec-title">{e.name}</div>
              <div className="ss-rec-reason">
                {[e.city, e.venue, e.start ? new Date(e.start).toLocaleString() : null]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            {onAttach ? (
              <button
                type="button"
                className="crm-btn"
                onClick={() => onAttach(normalizedToSceneRef(e, role, visibility))}
              >
                attach
              </button>
            ) : (
              <span className="ss-vis">preview</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
