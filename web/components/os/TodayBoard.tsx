"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import VeridianMark from "@/components/VeridianMark";
import { useVeridian } from "@/components/VeridianContext";
import { giveMiamiDay } from "@/lib/desk/time";
import type { DeskState } from "@/lib/desk/types";
import { computeMoves, rankMoves, STAGES, type Move } from "@/lib/os/moves";
import { findRipples, listingAsCommunity, POND_COMMUNITIES, useListing } from "@/lib/os/pond";
import { AUTONOMY, GOALS, goalLabel, usePrefs, type GoalId } from "@/lib/os/prefs";
import { ensureLocalProfile, loadSocialStore } from "@/lib/social-scene";
import { IconCheck, IconLock } from "./Icons";
import { localDesk, NODE_WORDS, useDeskNode } from "./useDeskNode";

type Snapshot = { state: DeskState; today: string };
type MoveMemory = { added: string[]; dismissed: Record<string, string> };

const VIEW_KEY = "veridian-os.today.view";
const MOVES_KEY = "veridian-os.moves.v1";

function loadMemory(): MoveMemory {
  try {
    const m = JSON.parse(window.localStorage.getItem(MOVES_KEY) ?? "null") as MoveMemory | null;
    if (m && Array.isArray(m.added) && m.dismissed && typeof m.dismissed === "object") return m;
  } catch {
    /* fall through */
  }
  return { added: [], dismissed: {} };
}

function saveMemory(m: MoveMemory) {
  try {
    window.localStorage.setItem(MOVES_KEY, JSON.stringify(m));
  } catch {
    /* this visit only */
  }
}

async function loadSnapshot(): Promise<Snapshot | null> {
  const r = await fetch("/api/desk/state", { cache: "no-store" });
  if (!r.ok) return null;
  const j = (await r.json()) as { state: DeskState; today: string; mode?: string };
  if (j.mode === "client") {
    const mine = localDesk();
    if (mine) return { state: mine, today: j.today };
  }
  return { state: j.state, today: j.today };
}

function monthOf(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`)).toUpperCase();
}

function greetingFor(h: number) {
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** Today: Option A (brief + next moves + the dock) with Option C (goal spaces) one tap away. */
export default function TodayBoard({ weekEvents, sceneQs }: { weekEvents: number; sceneQs: string }) {
  const { ask, addTasks, showTasks } = useVeridian();
  const [prefs] = usePrefs();
  const [listing] = useListing();
  const node = useDeskNode();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<"moves" | "goal">("moves");
  const [goal, setGoal] = useState<GoalId | null>(null);
  const [memory, setMemory] = useState<MoveMemory>({ added: [], dismissed: {} });
  const [showAll, setShowAll] = useState(false);
  const [hello, setHello] = useState({ line: "", greeting: "Hello", name: "" });
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    const date = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" }).format(now).toLowerCase();
    let name = "";
    try {
      const p = ensureLocalProfile(loadSocialStore()).profile;
      if (p.displayName && p.displayName !== "your profile") name = p.displayName.split(" ")[0];
    } catch {
      /* no profile yet */
    }
    setHello({ line: date, greeting: greetingFor(now.getHours()), name });
    setMemory(loadMemory());
    try {
      const v = window.localStorage.getItem(VIEW_KEY);
      if (v === "goal" || v === "moves") setView(v);
    } catch {
      /* default view */
    }
    loadSnapshot()
      .then((s) => (s ? setSnap(s) : setFailed(true)))
      .catch(() => setFailed(true));
  }, []);

  const pickView = (v: "moves" | "goal") => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* this visit only */
    }
  };

  const today = snap?.today ?? "";
  const all = useMemo(() => (snap ? rankMoves(computeMoves(snap.state, snap.today), prefs.goals) : []), [snap, prefs.goals]);
  const live = useMemo(() => all.filter((m) => !m.goalOnly && memory.dismissed[m.id] !== today), [all, memory, today]);
  const shown = showAll ? live : live.slice(0, 4);
  const activeGoal = goal ?? prefs.goals[0] ?? "staffing";
  const ripples = useMemo(() => findRipples([...(listing ? [listingAsCommunity(listing)] : []), ...POND_COMMUNITIES]), [listing]);
  const gmd = today ? giveMiamiDay(today) : null;
  const lastFiled = snap?.state.feed?.[0];
  const helpersOpen = Boolean(snap?.state.standingRoles?.some((r) => r.status === "open" && /give miami day/i.test(r.title)));

  const remember = useCallback((next: MoveMemory) => {
    setMemory(next);
    saveMemory(next);
  }, []);

  const doTask = (m: Move) => {
    if (m.action.kind !== "task") return;
    const ok = addTasks([{ type: "add", id: null, title: m.action.task.title, priority: m.action.task.priority, dueDate: m.action.task.dueDate }]);
    if (ok) {
      remember({ ...memory, added: Array.from(new Set([...memory.added, m.id])) });
      setFlash(`Added to your priorities: ${m.action.task.title}`);
      window.setTimeout(() => setFlash(null), 3200);
    } else setFlash("Couldn't add that to your priorities. Try again from the Veridian panel.");
  };
  const dismiss = (m: Move) => remember({ ...memory, dismissed: { ...memory.dismissed, [m.id]: today } });

  const card = (m: Move, compact = false) => {
    const added = memory.added.includes(m.id);
    return (
      <article key={m.id} className={`os-move${compact ? " is-compact" : ""}`}>
        {!compact && (
          <div className="os-move-path">
            <span className="os-move-by"><VeridianMark size={13} />veridian connects</span>
            {m.path.map((p, i) => (
              <Fragment key={`${p}-${i}`}>
                {i > 0 && <span className="os-arrow" aria-hidden>→</span>}
                <span className="os-chip">{p}</span>
              </Fragment>
            ))}
          </div>
        )}
        <h3>{m.title}</h3>
        <p>{m.why}</p>
        <div className="os-move-actions">
          {added ? (
            <>
              <span className="os-added"><IconCheck /> On your priorities</span>
              {!compact && <button type="button" className="os-btn-ghost" onClick={showTasks}>Open priorities</button>}
            </>
          ) : m.action.kind === "task" ? (
            <button type="button" className="os-btn" onClick={() => doTask(m)}>{m.action.label}</button>
          ) : (
            <Link href={m.action.href} prefetch={false} className="os-btn">{m.action.label}</Link>
          )}
          {m.ask && !compact && <button type="button" className="os-btn-ghost" onClick={() => ask(m.ask!.prompt)}>{m.ask.label}</button>}
          {!compact && !m.goalOnly && <button type="button" className="os-btn-text" onClick={() => dismiss(m)}>Not now</button>}
          {!compact && <span className="os-move-note"><IconLock />{m.note}</span>}
        </div>
      </article>
    );
  };

  const autonomy = AUTONOMY.find((a) => a.id === prefs.autonomy);
  const goalTabs = [...prefs.goals, ...GOALS.map((g) => g.id).filter((g) => !prefs.goals.includes(g))];

  return (
    <section className="os-today" aria-labelledby="os-today-title">
      <div className="os-today-hero">
        <div className="eyebrow">{hello.line ? `${hello.line} · ` : ""}today's brief</div>
        <h1 id="os-today-title" className="os-today-title">{hello.greeting}{hello.name ? `, ${hello.name}` : ""}.</h1>
        <p className="os-today-sub">
          {snap
            ? live.length
              ? `Veridian lined up ${live.length} ${live.length === 1 ? "move" : "moves"} for your goals. Approve the ones you like. Nothing leaves your team without you.`
              : "You're clear for now. Veridian brings the next move here as the desk and The Pond change."
            : failed
              ? "The desk isn't answering right now, so moves will appear once it's back."
              : "Veridian is lining up today's moves…"}
        </p>
        <div className="os-goal-row">
          <span className="os-goal-label">your goals</span>
          {prefs.goals.map((g) => <span key={g} className="os-goal-chip">{goalLabel(g)}</span>)}
          <Link href="/setup#goals" prefetch={false} className="os-goal-tune">tune</Link>
        </div>
      </div>

      {flash && <p className="os-flash" role="status">{flash}</p>}

      <div className="os-section-head">
        <h2>{view === "moves" ? "next moves" : "goal spaces"}</h2>
        <div className="os-toggle" role="group" aria-label="View">
          <button type="button" aria-pressed={view === "moves"} onClick={() => pickView("moves")}>by moves</button>
          <button type="button" aria-pressed={view === "goal"} onClick={() => pickView("goal")}>by goal</button>
        </div>
      </div>

      {view === "moves" ? (
        <div className="os-today-grid">
          <div className="os-moves">
            {!snap && !failed && [0, 1, 2].map((i) => <div key={i} className="os-move is-skeleton" aria-hidden />)}
            {shown.map((m) => card(m))}
            {snap && live.length > 4 && (
              <button type="button" className="os-btn-ghost os-more" onClick={() => setShowAll(!showAll)}>
                {showAll ? "Show fewer" : `Show ${live.length - 4} more`}
              </button>
            )}
          </div>

          <aside className="os-glance" aria-label="At a glance">
            <section>
              <h2>this week</h2>
              {gmd && gmd.daysAway >= 0 && (
                <div className="os-date-row">
                  <div className="os-date-tile"><span>{monthOf(gmd.date)}</span><strong>{Number(gmd.date.slice(8, 10))}</strong></div>
                  <div>
                    <div className="os-glance-strong">Give Miami Day</div>
                    <div className="os-glance-meta">{gmd.daysAway === 0 ? "today" : gmd.daysAway === 1 ? "tomorrow" : `${gmd.daysAway} days away`} · {helpersOpen ? "helpers needed" : "on your calendar"}</div>
                  </div>
                </div>
              )}
              <p>{weekEvents > 0 ? `${weekEvents} ${weekEvents === 1 ? "event" : "events"} in your scene this week.` : "Add follows or cities to fill your week."}</p>
              <Link href={`/events${sceneQs ? `?${sceneQs}` : ""}`} prefetch={false}>open events</Link>
            </section>
            <section>
              <h2>the pond</h2>
              <p>{ripples.length ? `${ripples.length} ripples are waiting: ${ripples[0].needer.name} and ${ripples[0].offerer.name} first.` : "No ripples yet. Join The Pond so Veridian can match you."}</p>
              <Link href={`/social-scene${sceneQs ? `?${sceneQs}` : ""}`} prefetch={false}>open the pond</Link>
            </section>
            <section>
              <h2>desk</h2>
              <p>
                {lastFiled ? `Last filed: ${lastFiled.text.length > 90 ? `${lastFiled.text.slice(0, 88)}…` : lastFiled.text}` : "Nothing filed yet today."}{" "}
                Node {node ? NODE_WORDS[node.status] : "checking"}.
              </p>
              <Link href="/desk" prefetch={false}>open desk</Link>
            </section>
          </aside>
        </div>
      ) : (
        <div className="os-goalspace">
          <div className="os-goal-tabs" role="group" aria-label="Goal">
            {goalTabs.map((g) => (
              <button key={g} type="button" aria-pressed={g === activeGoal} onClick={() => setGoal(g)}>{goalLabel(g)}</button>
            ))}
          </div>
          <p className="os-goal-mode">
            <VeridianMark size={16} />
            <span>Veridian works this goal in <strong>{autonomy?.label ?? "draft"}</strong> mode. It finds people and drafts every message; anything that leaves your team waits for you.</span>
            <Link href="/setup#autonomy" prefetch={false}>change</Link>
          </p>
          <div className="os-stages">
            {STAGES.map((s, i) => {
              const items = all.filter((m) => m.goal === activeGoal && m.stage === s.id && memory.dismissed[m.id] !== today);
              return (
                <section key={s.id} className="os-stage" aria-label={s.label}>
                  <div className="os-stage-head">
                    <span className="os-stage-n">{i + 1}</span>
                    <h3>{s.label}</h3>
                    <span className="os-stage-where">{s.where}</span>
                  </div>
                  {s.id === "connect" && <div className="os-stage-gate"><IconLock /> you approve each send</div>}
                  {items.length ? items.map((m) => card(m, true)) : <p className="os-stage-empty">{snap ? s.empty : "…"}</p>}
                </section>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
