"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import VeridianMark from "@/components/VeridianMark";
import { useSceneBridge } from "@/components/SceneBridge";
import {
  type CrmSuggestion,
  greetingForHour,
  loadCrm,
  seedFromScene,
  saveCrm,
  suggestActions,
} from "@/lib/crm";
import {
  type CalEvent,
  demoAgenda,
  fetchUpcomingEvents,
  fmtCalWhen,
  getStoredToken,
  hasGoogleClientId,
  connectGoogleCalendar,
} from "@/lib/gcal";

export default function VeridianDock() {
  const { following, convergingHosts, sceneQs, eventCount } = useSceneBridge();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<CrmSuggestion[]>([]);
  const [counts, setCounts] = useState({ total: 0, due: 0 });
  const [meetings, setMeetings] = useState<CalEvent[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const store = loadCrm();
    const sugg = suggestActions(store.contacts, { convergingHosts });
    setSuggestions(sugg.slice(0, 5));
    setCounts({
      total: store.contacts.length,
      due: sugg.filter((s) => s.kind === "due").length,
    });
  }, [convergingHosts]);

  useEffect(() => {
    if (!open) return;
    refresh();
    const token = getStoredToken();
    if (token && hasGoogleClientId()) {
      fetchUpcomingEvents(token, 3)
        .then(setMeetings)
        .catch(() => setMeetings(demoAgenda().slice(0, 3)));
    } else {
      setMeetings(demoAgenda().slice(0, 3));
    }
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const crmHref = sceneQs ? `/crm?${sceneQs}` : "/crm";
  const greet = greetingForHour();

  const importFollows = () => {
    const store = loadCrm();
    const before = store.contacts.length;
    const next = seedFromScene(store, { following });
    saveCrm(next);
    refresh();
    setToast(`imported ${next.contacts.length - before} follows`);
    window.setTimeout(() => setToast(null), 2000);
  };

  const connectCal = async () => {
    if (!hasGoogleClientId()) {
      setToast("set NEXT_PUBLIC_GOOGLE_CLIENT_ID");
      window.setTimeout(() => setToast(null), 2500);
      return;
    }
    try {
      const token = await connectGoogleCalendar();
      const list = await fetchUpcomingEvents(token, 3);
      setMeetings(list);
      setToast("calendar connected");
    } catch {
      setToast("calendar connect failed");
    }
    window.setTimeout(() => setToast(null), 2000);
  };

  return (
    <>
      <button
        type="button"
        className="veridian-fab"
        aria-label="open veridian assistant"
        onClick={() => setOpen(true)}
      >
        <VeridianMark size={22} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              className="chat-backdrop"
              aria-label="close veridian"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.aside
              className="veridian-dock"
              role="dialog"
              aria-label="veridian assistant"
              initial={reduce ? false : { x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={reduce ? undefined : { x: 40, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            >
              <div className="veridian-dock-head">
                <div className="chat-peer">
                  <VeridianMark size={28} />
                  <div>
                    <div className="chat-peer-name">veridian</div>
                    <div className="chat-peer-status">your assistant · on-device</div>
                  </div>
                </div>
                <button type="button" className="chat-close" aria-label="close" onClick={() => setOpen(false)}>
                  ×
                </button>
              </div>

              <div className="veridian-dock-body">
                <p className="veridian-dock-greet">
                  {greet}. {eventCount > 0 ? `${eventCount} events in your scene.` : "your scene is quiet."}{" "}
                  {counts.total > 0
                    ? `${counts.total} CRM contacts${counts.due ? ` · ${counts.due} due` : ""}.`
                    : "CRM is empty — import follows to start."}
                </p>

                {toast && <div className="crm-toast">{toast}</div>}

                <div className="veridian-dock-section">
                  <div className="veridian-dock-label">today&apos;s brief</div>
                  {suggestions.length === 0 ? (
                    <p className="sub" style={{ margin: 0 }}>
                      nothing urgent — enjoy the quiet.
                    </p>
                  ) : (
                    <ul className="veridian-dock-list">
                      {suggestions.map((s) => (
                        <li key={`${s.kind}-${s.name}`}>
                          <strong>{s.name}</strong>
                          <span>{s.reason}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="veridian-dock-section">
                  <div className="veridian-dock-label">calendar</div>
                  <ul className="veridian-dock-list">
                    {meetings.map((m) => (
                      <li key={m.id}>
                        <strong>{fmtCalWhen(m.start, m.allDay)}</strong>
                        <span>{m.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="veridian-dock-actions">
                  <a className="crm-btn" href={crmHref} onClick={() => setOpen(false)}>
                    open CRM
                  </a>
                  <a
                    className="crm-btn"
                    href={sceneQs ? `/social-scene?${sceneQs}` : "/social-scene"}
                    onClick={() => setOpen(false)}
                  >
                    social scene
                  </a>
                  <button type="button" className="crm-btn ghost" onClick={importFollows}>
                    import follows
                  </button>
                  <button type="button" className="crm-btn ghost" onClick={connectCal}>
                    connect calendar
                  </button>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
