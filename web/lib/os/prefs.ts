/**
 * Your Veridian: goals, autonomy and channels. Kept in this browser, like
 * tasks and the on-device CRM. No account, no server copy.
 */
import { useCallback, useEffect, useState } from "react";

export type GoalId = "staffing" | "recruiting" | "events" | "fundraising" | "bd" | "volunteering";
export type Autonomy = "suggest" | "draft" | "supervised" | "autonomous";
export type Channel = "chat" | "voice" | "node";

export type Prefs = {
  version: 1;
  /** In priority order. The first goal leads Today and The Pond. */
  goals: GoalId[];
  autonomy: Autonomy;
  channels: Record<Channel, boolean>;
  /** Links the person added for Veridian to draw on. */
  links: string[];
};

export const GOALS: { id: GoalId; label: string; hint: string }[] = [
  { id: "staffing", label: "staffing", hint: "fill shifts and event roles" },
  { id: "recruiting", label: "recruiting", hint: "volunteers, mentors and hires" },
  { id: "events", label: "events", hint: "workshops and community days" },
  { id: "fundraising", label: "fundraising", hint: "donors and thank-yous" },
  { id: "bd", label: "sponsors", hint: "partners and sponsors" },
  { id: "volunteering", label: "volunteering", hint: "help other communities" },
];

export const AUTONOMY: { id: Autonomy; label: string; blurb: string }[] = [
  { id: "suggest", label: "suggest", blurb: "Recommendations only" },
  { id: "draft", label: "draft", blurb: "Veridian prepares, you send" },
  { id: "supervised", label: "supervised", blurb: "Works within your limits and tells you" },
  { id: "autonomous", label: "autonomous", blurb: "Works on its own within a set budget" },
];

export const CHANNELS: { id: Channel; label: string; meta: string }[] = [
  { id: "chat", label: "Chat", meta: "The Veridian panel on every page. Always on." },
  { id: "voice", label: "Voice", meta: "Hold to talk on Today, English and Spanish. Creole notes are entered by staff." },
  { id: "node", label: "Front desk node", meta: "Shows its status in the sidebar; its button arms the mic for one capture" },
];

export const goalLabel = (id: GoalId): string => GOALS.find((g) => g.id === id)?.label ?? id;

export const DEFAULT_PREFS: Prefs = {
  version: 1,
  goals: ["staffing", "recruiting", "events", "fundraising"],
  autonomy: "draft",
  channels: { chat: true, voice: true, node: true },
  links: [],
};

const KEY = "veridian-os.prefs.v1";
const EVENT = "veridian-os:prefs";
const GOAL_IDS = GOALS.map((g) => g.id);
const AUTONOMY_IDS = AUTONOMY.map((a) => a.id);

function clean(x: unknown): Prefs {
  if (!x || typeof x !== "object") return DEFAULT_PREFS;
  const p = x as Partial<Prefs>;
  const goals = Array.isArray(p.goals) ? p.goals.filter((g): g is GoalId => GOAL_IDS.includes(g as GoalId)) : [];
  const channels = { ...DEFAULT_PREFS.channels };
  if (p.channels && typeof p.channels === "object") {
    for (const c of Object.keys(channels) as Channel[]) {
      if (typeof p.channels[c] === "boolean") channels[c] = p.channels[c];
    }
  }
  return {
    version: 1,
    goals: goals.length ? Array.from(new Set(goals)) : DEFAULT_PREFS.goals,
    autonomy: AUTONOMY_IDS.includes(p.autonomy as Autonomy) ? (p.autonomy as Autonomy) : DEFAULT_PREFS.autonomy,
    channels,
    links: Array.isArray(p.links) ? p.links.filter((l): l is string => typeof l === "string" && l.trim().length > 0).slice(0, 12) : [],
  };
}

export function loadPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    return clean(JSON.parse(window.localStorage.getItem(KEY) ?? "null"));
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(p: Prefs): boolean {
  let ok = true;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(clean(p)));
  } catch {
    ok = false;
  }
  window.dispatchEvent(new Event(EVENT));
  return ok;
}

/** Prefs start at the defaults on the server and first paint, then load from this browser. */
export function usePrefs(): [Prefs, (next: Prefs) => void] {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  useEffect(() => {
    const sync = () => setPrefs(loadPrefs());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const update = useCallback((next: Prefs) => {
    setPrefs(clean(next));
    savePrefs(next);
  }, []);
  return [prefs, update];
}
