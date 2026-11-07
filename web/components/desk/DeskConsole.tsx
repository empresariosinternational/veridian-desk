"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import VeridianMark from "@/components/VeridianMark";
import { SCRIPT } from "@/lib/desk/fallback";
import { fmtTime } from "@/lib/desk/time";
import type { DeskPayload } from "@/lib/desk/payload";
import type { FunderView } from "@/lib/desk/privacy";
import type { AssistantMode, AssistantMessage, BoardId, CardRef, ExecutiveTask, HearOutcome, OrgId, ProfileId } from "@/lib/desk/types";
import DeskAssistant from "./DeskAssistant";
import { Board, type BoardCtx, type SentenceCheck } from "./DeskBoards";
import css from "./DeskConsole.module.css";

type Voice = { heard: string; spoke: string; notice: string | null; via: string };

type HearResponse = Partial<DeskPayload> & {
  ok: boolean;
  outcome?: HearOutcome;
  transcript?: string;
  speech?: { audioBase64: string; mimeType: string } | null;
  voice?: Voice;
  notice?: string | null;
  assistant?: { status: "live" | "fallback"; reply: string; tasks: ExecutiveTask[] };
};

type Last = { transcript: string; outcome: HearOutcome | null; voice: Voice | null; notice: string | null; at: number };

const GROUPS: { label: string; ids: ProfileId[] }[] = [
  { label: "Tidepath · B2B", ids: ["marisol", "denise", "yesenia", "reginald", "owen", "claudette"] },
  { label: "Mangrove Mews · B2B", ids: ["beatriz"] },
  { label: "People · B2C", ids: ["ana", "luis"] },
];

const ALL_BOARDS = ["calls", "donors", "workshops", "notes", "staffing", "recruiting", "grants", "colony", "network"] as const;

const CLOSE_LINE = "Said once. Filed once. The right person and the other community answered the same day.";

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return undefined;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export default function DeskConsole() {
  const [data, setData] = useState<DeskPayload | null>(null);
  const [offline, setOffline] = useState(false);
  const [active, setActive] = useState<ProfileId>("marisol");
  const [busy, setBusy] = useState<string | null>(null);
  const [last, setLast] = useState<Last | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [funderOn, setFunderOn] = useState(false);
  const [funder, setFunder] = useState<FunderView | null>(null);
  const [recording, setRecording] = useState(false);
  const [hotCards, setHotCards] = useState<CardRef[]>([]);
  const [resetArmed, setResetArmed] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [assistantEpoch, setAssistantEpoch] = useState(0);

  const lastWrite = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rec = useRef<{ rec: MediaRecorder; chunks: Blob[]; stream: MediaStream; started: number } | null>(null);
  const holding = useRef(false);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2800);
  }, []);

  const apply = useCallback((j: Partial<DeskPayload>) => {
    if (j && j.state && j.node) {
      lastWrite.current = Date.now();
      setData(j as DeskPayload);
    }
  }, []);

  // Poll the desk (and the physical node's button) every 1.5 s.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const startedAt = Date.now();
      try {
        const r = await fetch("/api/desk/state", { cache: "no-store" });
        const j = (await r.json()) as DeskPayload;
        if (alive && r.ok && startedAt >= lastWrite.current) {
          setData(j);
          setOffline(false);
        }
      } catch {
        if (alive) setOffline(true);
      }
    };
    tick();
    const id = window.setInterval(tick, 1500);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  // Funder view comes from the server's redaction, not from hiding text here.
  const clinicalCount = data?.state.notes.filter((n) => n.dataClass === "CLINICAL").length ?? 0;
  useEffect(() => {
    if (!funderOn) return;
    fetch("/api/desk/state?view=funder", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: FunderView) => setFunder(j))
      .catch(() => setFunder(null));
  }, [funderOn, clinicalCount]);

  const post = useCallback(
    async <T,>(url: string, body: unknown): Promise<T | null> => {
      try {
        const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        return (await r.json()) as T;
      } catch {
        flash("Desk server unreachable — is npm run dev running?");
        return null;
      }
    },
    [flash],
  );

  const hot = useMemo(() => new Set(hotCards.map((c) => c.id)), [hotCards]);
  const hotBoards = useMemo(() => {
    const s = new Set<string>();
    for (const c of hotCards) {
      if (c.board === "person") {
        const r = data?.state.recruits.find((x) => x.id === c.id);
        const h = data?.state.hours.find((x) => x.id === c.id);
        const n = data?.state.notes.find((x) => x.id === c.id);
        const pid = r?.personId ?? h?.personId ?? (n?.subject as ProfileId | undefined) ?? n?.author;
        if (pid) s.add(`person:${pid}`);
      } else s.add(c.board);
    }
    return s;
  }, [hotCards, data]);

  const showCards = useCallback((cards: CardRef[]) => {
    setHotCards(cards);
    window.setTimeout(() => setHotCards((c) => (c === cards ? [] : c)), 2600);
  }, []);

  const hear = useCallback(
    async (payload: { text?: string; audioBase64?: string; mimeType?: string; source?: "script" | "typed"; mode?: AssistantMode; messages?: AssistantMessage[] }): Promise<HearResponse | null> => {
      setBusy("hear");
      audioRef.current?.pause();
      audioRef.current = null;
      const j = await post<HearResponse>("/api/desk/hear", { ...payload, profileHint: active });
      setBusy(null);
      if (!j) return null;
      apply(j);
      if (payload.source !== "typed" || payload.mode === "file") setLast({ transcript: j.transcript ?? payload.text ?? "", outcome: j.outcome ?? null, voice: j.voice ?? null, notice: j.notice ?? null, at: Date.now() });
      if (j.outcome?.ok) {
        if (j.outcome.speaker !== "unknown") setActive(j.outcome.speaker);
        showCards(j.outcome.cards);
        if (j.outcome.scriptId) setDone((d) => new Set(d).add(j.outcome!.scriptId!));
      } else if (j.notice) flash(j.notice);
      if (j.speech?.audioBase64) {
        const a = new Audio(`data:${j.speech.mimeType};base64,${j.speech.audioBase64}`);
        audioRef.current = a;
        a.play().catch(() => undefined);
      }
      return j;
    },
    [active, apply, flash, post, showCards],
  );

  const nodeEvent = useCallback(
    async (event: "arm" | "disarm" | "presence") => {
      const j = await post<Partial<DeskPayload>>("/api/desk/node", { event });
      if (j) apply(j);
    },
    [apply, post],
  );

  // Push-to-talk: the mic opens only while the button is held, after Arm.
  const startTalk = useCallback(async () => {
    holding.current = true;
    if (rec.current || !data) return;
    if (!data.voiceReady.key) return flash("OpenAI key missing — type a note or use a demo line");
    if (!data.node.armed) return flash("Arm the desk first — consent comes before the mic.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!holding.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const mime = pickMime();
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.start();
      rec.current = { rec: r, chunks, stream, started: Date.now() };
      setRecording(true);
    } catch {
      flash("Microphone blocked — allow it in the browser, or use a scripted line.");
    }
  }, [data, flash]);

  const stopTalk = useCallback(async () => {
    holding.current = false;
    const cur = rec.current;
    if (!cur) return;
    rec.current = null;
    setRecording(false);
    await new Promise<void>((resolve) => {
      cur.rec.onstop = () => resolve();
      cur.rec.stop();
    });
    cur.stream.getTracks().forEach((t) => t.stop());
    if (Date.now() - cur.started < 450) return flash("Hold the button while you talk.");
    const blob = new Blob(cur.chunks, { type: cur.rec.mimeType || "audio/webm" });
    await hear({ audioBase64: await blobToBase64(blob), mimeType: blob.type });
  }, [flash, hear]);

  const act: BoardCtx["act"] = useMemo(
    () => ({
      acceptMatch: async (matchId: string, orgId: OrgId) => {
        setBusy(`match:${matchId}:${orgId}`);
        const j = await post<Partial<DeskPayload> & { ok: boolean; say?: string; error?: string; reasons?: string[]; cards?: CardRef[] }>(
          "/api/desk/match/accept",
          { matchId, orgId },
        );
        setBusy(null);
        if (!j) return;
        apply(j);
        if (j.ok) {
          showCards(j.cards ?? []);
          flash(j.say ?? "Accepted.");
        } else flash(`${j.error}${j.reasons?.length ? ` (${j.reasons.join(", ")})` : ""}`);
      },
      respondShift: async (recruitId: string, decision: "accept" | "decline") => {
        setBusy(`shift:${recruitId}`);
        const j = await post<Partial<DeskPayload> & { ok: boolean; say?: string; error?: string; cards?: CardRef[] }>("/api/desk/action", {
          type: "shift.respond",
          recruitId,
          decision,
        });
        setBusy(null);
        if (!j) return;
        apply(j);
        if (j.ok) showCards(j.cards ?? []);
        flash(j.ok ? j.say ?? "Done." : j.error ?? "Could not answer that offer.");
      },
      setGrouping: async (value: "school" | null) => {
        const j = await post<Partial<DeskPayload> & { ok: boolean; say?: string }>("/api/desk/action", {
          type: "preference.set",
          profileId: "marisol",
          key: "callListGrouping",
          value,
        });
        if (!j) return;
        apply(j);
        flash(value === "school" ? "Veridian remembered: Marisol groups calls by school." : "Veridian forgot that preference.");
      },
      checkSentence: async (text: string) => {
        const j = await post<{ ok: boolean; check: SentenceCheck }>("/api/desk/action", { type: "grant.check", text });
        return j?.check ?? null;
      },
    }),
    [apply, flash, post, showCards],
  );

  const reset = useCallback(async () => {
    if (!resetArmed) {
      setResetArmed(true);
      window.setTimeout(() => setResetArmed(false), 3000);
      return;
    }
    setResetArmed(false);
    const j = await post<Partial<DeskPayload>>("/api/desk/action", { type: "reset" });
    if (j) {
      apply(j);
      setLast(null);
      setDone(new Set());
      setAssistantEpoch((epoch) => epoch + 1);
      setActive("marisol");
      setFunderOn(false);
      flash("Desk reset to the seed.");
    }
  }, [apply, flash, post, resetArmed]);

  if (!data) {
    return (
      <div className={css.console}>
        <div className={css.brand}>
          <VeridianMark size={28} />
          <h1 className={css.title}>Veridian Desk</h1>
        </div>
        <p className={css.hint}>{offline ? "The desk server is not answering. Start it with npm run dev in web/." : "Loading the desk…"}</p>
      </div>
    );
  }

  const { state, node, voiceReady, giveMiamiDay } = data;
  const profile = state.profiles[active];
  const working = busy === "hear" || node.status === "WORKING";
  const lampOn = (c: "red" | "amber" | "green" | "white") =>
    (working ? "amber" : node.color) === c ? css.lampOn : "";
  const pending = (id: ProfileId) =>
    (id === "luis" || id === "ana") && state.recruits.some((r) => r.personId === id && r.status === "pending");
  const shiftFilled = state.shifts.some((s) => s.status === "filled");
  const matchAccepted = state.matches.some((m) => m.proposal.status === "accepted");
  const complete = shiftFilled && matchAccepted;
  const frontBoards: BoardId[] = profile.side === "B2C" ? ["person"] : profile.boards;
  const otherBoards = ALL_BOARDS.filter((b) => !frontBoards.includes(b));
  const otherPeople = (["ana", "luis"] as ProfileId[]).filter((p) => p !== active);

  const ctx: BoardCtx = { data, active, hot, hotBoards, funder, funderOn, setFunderOn, busy, act };

  return (
    <div className={css.console}>
      <header className={css.head}>
        <div className={css.brand}>
          <VeridianMark size={30} />
          <div>
            <h1 className={css.title}>Veridian Desk</h1>
            <p className={css.subtitle}>Say it once. The desk files it, routes the urgent thing, and keeps private things private.</p>
          </div>
        </div>
        <span className={`${css.pill} ${voiceReady.key ? css.pillOk : css.pillWarn}`}>
          {voiceReady.key ? "OpenAI GPT · ready" : "OpenAI key missing — filing uses desk rules"}
        </span>
        <span className={`${css.pill} ${css.pillVeridian}`}>{giveMiamiDay.label}</span>
        {!data.persistence && <span className={`${css.pill} ${css.pillWarn}`}>running from memory</span>}
        {offline && <span className={`${css.pill} ${css.pillWarn}`}>reconnecting…</span>}
      </header>

      <nav className={css.chips} aria-label="whose desk is in front">
        {GROUPS.map((g) => (
          <div key={g.label} className={css.chipGroup}>
            <span className={css.chipGroupLabel}>{g.label}</span>
            {g.ids.map((id) => (
              <button
                key={id}
                type="button"
                className={`${css.chip} ${active === id ? css.chipActive : ""}`}
                aria-pressed={active === id}
                disabled={busy === "hear"}
                onClick={() => setActive(id)}
              >
                <strong>{state.profiles[id].name}</strong> · {state.profiles[id].role}
                {pending(id) && <span className={css.chipDot} aria-label="offer waiting" />}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className={css.grid}>
        <aside className={`${css.panel} ${css.sticky}`} aria-label="desk node">
          <DeskAssistant key={assistantEpoch} active={active} profiles={state.profiles} busy={busy === "hear"} onSend={hear} />
          <div className={css.row}>
            <span className={css.label}>Desk node</span>
            <span className={css.hint} style={{ marginLeft: "auto" }}>
              on-screen node · hardware mirrors it
            </span>
          </div>
          <div className={css.device}>
            <div className={css.lights} aria-hidden="true">
              <span className={`${css.lamp} ${css.lampRed} ${lampOn("red")} ${node.blink && !working ? css.blink : ""}`} />
              <span className={`${css.lamp} ${css.lampAmber} ${lampOn("amber")}`} />
              <span className={`${css.lamp} ${css.lampGreen} ${lampOn("green")}`} />
              <span className={`${css.lamp} ${css.lampIdle} ${lampOn("white")}`} />
            </div>
            <div className={css.oled} role="status" aria-live="polite">
              <span className={css.oledStatus}>{working ? "WORKING" : node.status}</span>
              <span className={node.urgent && node.status === "IDLE" ? css.urgentText : ""}>{node.line}</span>
            </div>
          </div>
          {node.presence && <div className={css.presence}>Someone is at the desk.</div>}
          <div className={css.row}>
            <button type="button" className={`${css.btn} ${css.btnArm}`} onClick={() => nodeEvent("arm")} disabled={working}>
              Arm
            </button>
            <button type="button" className={css.btn} onClick={() => nodeEvent("disarm")}>
              Disarm
            </button>
            <button type="button" className={`${css.btn} ${css.btnGhost} ${css.btnSmall}`} onClick={() => nodeEvent("presence")} title="Simulates the PIR sensor">
              PIR: someone here
            </button>
          </div>
          <button
            type="button"
            className={`${css.ptt} ${recording ? css.pttLive : ""}`}
            disabled={!voiceReady.key || (!node.armed && !recording) || busy === "hear"}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              startTalk();
            }}
            onPointerUp={() => stopTalk()}
            onPointerCancel={() => stopTalk()}
            onKeyDown={(e) => {
              if ((e.key === " " || e.key === "Enter") && !e.repeat) {
                e.preventDefault();
                startTalk();
              }
            }}
            onKeyUp={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                stopTalk();
              }
            }}
          >
            {recording ? "● Listening — release to file" : node.armed ? "Hold to talk" : "Arm first, then hold to talk"}
          </button>
          <p className={css.hint}>
            Push-to-talk only. No always-on microphone, no room recording. Audio goes to OpenAI and is not stored by the desk. Spoken confirmations use an AI-generated voice.
            {!voiceReady.creoleLive && " Creole notes are entered by staff."}
          </p>

          {last && (
            <div className={css.last} aria-live="polite">
              <div className={css.row}>
                <span className={css.label}>Heard · {fmtTime(new Date(last.at).toISOString())}</span>
                {last.outcome && <span className={`${css.tag} ${css.tagLang}`}>{last.outcome.lang === "es" ? "Español" : "English"}</span>}
                {last.outcome?.alreadyFiled && <span className={`${css.tag} ${css.tagOk}`}>Already filed</span>}
              </div>
              {last.transcript && <p className={css.quote}>“{last.transcript}”</p>}
              {last.outcome?.say && <p className={css.say}>{last.outcome.say}</p>}
              {last.outcome?.cards?.length ? (
                <div className={css.tags}>
                  {last.outcome.cards.map((c) => (
                    <span key={`${c.board}-${c.id}-${c.label}`} className={css.tag}>
                      {c.label}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className={css.row}>
                {last.voice?.via && <span className={css.hint}>{last.voice.via}</span>}
                {audioRef.current && (
                  <button type="button" className={`${css.btn} ${css.btnGhost} ${css.btnSmall}`} onClick={() => audioRef.current?.play().catch(() => undefined)}>
                    ▶ replay
                  </button>
                )}
              </div>
              {last.notice && <p className={css.notice}>{last.notice}</p>}
            </div>
          )}

          <div className={css.scriptList}>
            <span className={css.label}>Demo lines · same pipeline as the mic</span>
            {SCRIPT.map((l) => (
              <button
                key={l.id}
                type="button"
                className={`${css.scriptBtn} ${done.has(l.id) ? css.scriptDone : ""}`}
                disabled={busy === "hear"}
                onClick={() => hear({ text: l.text, source: "script" })}
              >
                <span className={css.stepNum}>{l.step}</span>
                <span>
                  <strong>
                    {l.label}
                    {l.optional ? " (optional)" : ""}
                  </strong>
                  {l.text}
                </span>
              </button>
            ))}
            <button type="button" className={css.scriptBtn} disabled={busy === "hear"} onClick={() => hear({ text: SCRIPT[0].text, source: "script" })}>
              <span className={css.stepNum}>↻</span>
              <span>
                <strong>Repeat Marisol</strong>Say it again — the desk should answer “Already filed”.
              </span>
            </button>
          </div>
          <div className={css.row}>
            <button type="button" className={`${css.btn} ${css.btnGhost} ${css.btnSmall}`} onClick={reset} disabled={busy === "hear"}>
              {resetArmed ? "Click again to reset the demo" : "Reset demo"}
            </button>
          </div>
        </aside>

        <div className={css.boards}>
          <section className={css.front} aria-label="board in front">
            <div className={css.frontHead}>
              <h2 className={css.frontName}>{profile.fullName}</h2>
              <span className={css.frontRole}>
                {profile.role}
                {profile.orgId ? ` · ${state.orgs[profile.orgId].name}` : " · personal desk"}
              </span>
              <span className={css.tag}>{profile.side}</span>
            </div>
            {frontBoards.map((b) => (
              <Board key={b} id={b} ctx={ctx} front personId={b === "person" ? active : undefined} />
            ))}
          </section>

          <div className={`${css.closeLine} ${complete ? "" : css.closeLineQuiet}`}>{CLOSE_LINE}</div>

          <section aria-label="every board">
            <p className={css.label}>Every board on the desk</p>
            <div className={css.others}>
              {otherBoards.map((b) => (
                <Board key={b} id={b} ctx={ctx} compact />
              ))}
              {otherPeople.map((p) => (
                <Board key={p} id="person" personId={p} ctx={ctx} compact />
              ))}
            </div>
          </section>

          <section className={css.panel} aria-label="today">
            <span className={css.label}>Today · filed once</span>
            {!state.feed.length && <p className={css.hint}>Nothing filed yet. Arm the node or press a demo line.</p>}
            <ul className={css.feed}>
              {state.feed.slice(0, 14).map((f) => (
                <li key={f.id}>
                  <span className={css.feedTime}>{fmtTime(f.at)}</span>
                  <span>
                    <strong>{f.speaker === "desk" ? "Desk" : state.profiles[f.speaker]?.name}</strong> — {f.text} <span className={css.feedVia}>· {f.via}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {toast && (
        <div className={css.toast} role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
