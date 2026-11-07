"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type CalEvent,
  clearToken,
  connectGoogleCalendar,
  demoAgenda,
  fetchUpcomingEvents,
  fmtCalWhen,
  getStoredToken,
  hasGoogleClientId,
} from "@/lib/gcal";
import { loadCrm, matchMeetingToContacts } from "@/lib/crm";

type Props = {
  /** Scene query string for CRM deep links */
  sceneQs?: string;
};

export default function CalendarCard({ sceneQs = "" }: Props) {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [demo, setDemo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [crmHints, setCrmHints] = useState<Record<string, string>>({});

  const applyHints = useCallback((list: CalEvent[]) => {
    const contacts = loadCrm().contacts;
    const hints: Record<string, string> = {};
    for (const ev of list) {
      const matches = matchMeetingToContacts(contacts, ev.title);
      if (matches[0]) {
        const c = matches[0];
        if (c.lastTouch) {
          const days = Math.floor((Date.now() - new Date(c.lastTouch).getTime()) / 86400000);
          hints[ev.id] = `CRM: ${c.name} · last touch ${days}d ago`;
        } else {
          hints[ev.id] = `CRM: ${c.name} · never contacted`;
        }
      }
    }
    setCrmHints(hints);
  }, []);

  const loadDemo = useCallback(() => {
    const list = demoAgenda();
    setEvents(list);
    setDemo(true);
    setConnected(false);
    applyHints(list);
  }, [applyHints]);

  const loadReal = useCallback(async (token: string) => {
    const list = await fetchUpcomingEvents(token);
    setEvents(list);
    setDemo(false);
    setConnected(true);
    applyHints(list);
  }, [applyHints]);

  useEffect(() => {
    const token = getStoredToken();
    if (token && hasGoogleClientId()) {
      setBusy(true);
      loadReal(token)
        .catch(() => loadDemo())
        .finally(() => setBusy(false));
    } else {
      loadDemo();
    }
  }, [loadDemo, loadReal]);

  const onConnect = async () => {
    setError(null);
    if (!hasGoogleClientId()) {
      setError("set NEXT_PUBLIC_GOOGLE_CLIENT_ID to connect");
      return;
    }
    setBusy(true);
    try {
      const token = await connectGoogleCalendar();
      await loadReal(token);
    } catch (e: any) {
      setError(e?.message || "could not connect");
      loadDemo();
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = () => {
    clearToken();
    loadDemo();
  };

  const crmHref = sceneQs ? `/crm?${sceneQs}` : "/crm";

  return (
    <section className="cal-card" aria-label="calendar">
      <div className="cal-head">
        <div>
          <div className="cal-title">calendar</div>
          <div className="cal-sub">
            {demo ? (
              <>
                <span className="cal-demo-badge">demo</span> sample agenda
              </>
            ) : (
              "google calendar · next up"
            )}
          </div>
        </div>
        {connected ? (
          <button type="button" className="cal-btn ghost" onClick={onDisconnect}>
            disconnect
          </button>
        ) : (
          <button type="button" className="cal-btn" onClick={onConnect} disabled={busy}>
            {busy ? "…" : "connect google"}
          </button>
        )}
      </div>

      {error && <p className="cal-error">{error}</p>}

      <ul className="cal-list">
        {events.map((ev) => (
          <li key={ev.id}>
            <div className="cal-when">{fmtCalWhen(ev.start, ev.allDay)}</div>
            <div className="cal-event-title">
              {ev.htmlLink ? (
                <a href={ev.htmlLink} target="_blank" rel="noopener noreferrer">
                  {ev.title}
                </a>
              ) : (
                ev.title
              )}
            </div>
            {ev.location && <div className="cal-loc">{ev.location}</div>}
            {crmHints[ev.id] && <div className="cal-crm-hint">{crmHints[ev.id]}</div>}
          </li>
        ))}
      </ul>

      <a className="cal-foot-link" href={crmHref}>
        open CRM →
      </a>
    </section>
  );
}
