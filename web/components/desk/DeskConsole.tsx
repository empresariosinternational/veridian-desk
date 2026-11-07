"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import VeridianMark from "@/components/VeridianMark";
import { SCRIPT } from "@/lib/desk/fallback";
import { fmtTime } from "@/lib/desk/time";
import { cancelSpeech, canPlaySpoken, captureSpeech, speakWithPersonality, speechRecognition, type VoiceCapture } from "@/lib/desk/browser-voice";
import type { DeskPayload } from "@/lib/desk/payload";
import type { FunderView } from "@/lib/desk/privacy";
import type { AssistantMode, AssistantMessage, BoardId, CardRef, ExecutiveTask, HearOutcome, Lang, OrgId, ProfileId } from "@/lib/desk/types";
import DeskAssistant from "./DeskAssistant";
import ArduinoNode from "./ArduinoNode";
import { Board, type BoardCtx, type SentenceCheck } from "./DeskBoards";
import css from "./DeskConsole.module.css";

type Voice = { via: string };

type HearResponse = Partial<DeskPayload> & {
  ok: boolean;
  outcome?: HearOutcome;
  transcript?: string;
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
  const [captureSource, setCaptureSource] = useState<"manual" | "sonar" | null>(null);
  const [finishingVoice, setFinishingVoice] = useState(false);
  const [browserVoice, setBrowserVoice] = useState({ recognition: false, playback: false });
  const [voiceLanguage, setVoiceLanguage] = useState("en-US");
  const [hotCards, setHotCards] = useState<CardRef[]>([]);
  const [resetArmed, setResetArmed] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [assistantEpoch, setAssistantEpoch] = useState(0);

  const lastWrite = useRef(0);
  const spokenRef = useRef<{ text: string; lang: Lang } | null>(null);
  const rec = useRef<VoiceCapture | null>(null);
  const voiceTurn = useRef(0);
  const holding = useRef(false);
  const captureSourceRef = useRef<"manual" | "sonar" | null>(null);
  const finishingCapture = useRef(false);
  const stopTalkRef = useRef<() => void>(() => undefined);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2800);
  }, []);

  const cancelTalk = useCallback(() => {
    holding.current = false;
    finishingCapture.current = false;
    voiceTurn.current++;
    rec.current?.abort();
    rec.current = null;
    setRecording(false);
    captureSourceRef.current = null;
    setCaptureSource(null);
    setFinishingVoice(false);
    cancelSpeech();
  }, []);

  useEffect(() => {
    setBrowserVoice({ recognition: Boolean(speechRecognition()), playback: canPlaySpoken() });
    const onBlur = () => cancelTalk();
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("blur", onBlur);
      voiceTurn.current++;
      rec.current?.abort();
      rec.current = null;
      cancelSpeech();
    };
  }, [cancelTalk]);

  useEffect(() => {
    if (data && (!data.node.armed || offline) && rec.current) cancelTalk();
  }, [data?.node.armed, offline, cancelTalk]);

  const apply = useCallback((j: Partial<DeskPayload>) => {
    if (j && j.state && j.node) {
      lastWrite.current = Date.now();
      setData(j as DeskPayload);
    }
  }, []);

  // Poll the desk every 1.5 s. Arduino communicates directly over USB.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const startedAt = Date.now();
      try {
        const r = await fetch("/api/desk/state", { cache: "no-store" });
        if (!r.ok) throw new Error("Desk server unavailable");
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
    async (payload: { text: string; source?: "script" | "typed" | "voice"; lang?: Lang; mode?: AssistantMode; messages?: AssistantMessage[] }): Promise<HearResponse | null> => {
      setBusy("hear");
      const playbackTurn = voiceTurn.current;
      cancelSpeech();
      spokenRef.current = null;
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
      if (j.outcome?.ok && j.outcome.spoken && payload.source !== "typed" && playbackTurn === voiceTurn.current) {
        spokenRef.current = { text: j.outcome.spoken, lang: j.outcome.lang };
        const failed = () => flash("Spoken reply is unavailable. The confirmation is shown below.");
        void speakWithPersonality(j.outcome.spoken, j.outcome.lang, failed);
      }
      return j;
    },
    [active, apply, flash, post, showCards],
  );

  const nodeEvent = useCallback(
    async (event: "arm" | "disarm" | "presence") => {
      if (event === "disarm") cancelTalk();
      const j = await post<Partial<DeskPayload>>("/api/desk/node", { event });
      if (j) apply(j);
    },
    [apply, post, cancelTalk],
  );

  // Both modes require Arm. Sonar captures while the hand stays near the sensor.
  const startTalk = useCallback((source: "manual" | "sonar" = "manual") => {
    if (rec.current || finishingCapture.current || busy || !data) return;
    if (!data.node.armed) return flash("Arm the desk first — consent comes before the mic.");
    holding.current = true;
    captureSourceRef.current = source;
    setCaptureSource(source);
    cancelSpeech();
    try {
      const capture = captureSpeech(voiceLanguage);
      rec.current = capture;
      setRecording(true);
      void capture.result.then((result) => {
        if (rec.current !== capture) return;
        setRecording(false);
        if (result.error) {
          rec.current = null;
          holding.current = false;
          captureSourceRef.current = null;
          setCaptureSource(null);
          flash(result.error);
        } else if (source === "sonar") stopTalkRef.current();
      });
    } catch (error) {
      holding.current = false;
      captureSourceRef.current = null;
      setCaptureSource(null);
      flash((error as Error).message);
    }
  }, [busy, data, flash, voiceLanguage]);

  const stopTalk = useCallback(async () => {
    holding.current = false;
    const cur = rec.current;
    if (!cur || finishingCapture.current) return;
    finishingCapture.current = true;
    const turn = voiceTurn.current;
    setRecording(false);
    setFinishingVoice(true);
    cur.stop();
    const result = await cur.result;
    if (turn !== voiceTurn.current) return;
    rec.current = null;
    finishingCapture.current = false;
    captureSourceRef.current = null;
    setCaptureSource(null);
    setFinishingVoice(false);
    if (result.aborted) return;
    if (result.error) return flash(result.error);
    if (!result.text) return flash("Didn't hear any speech. Hold the button while you talk.");
    await hear({ text: result.text, source: "voice", lang: voiceLanguage.startsWith("es") ? "es" : "en" });
  }, [flash, hear, voiceLanguage]);

  useEffect(() => { stopTalkRef.current = () => { void stopTalk(); }; }, [stopTalk]);

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
      spokenRef.current = null;
      cancelSpeech();
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
  const voiceBusy = recording || finishingVoice || Boolean(rec.current);
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
        <span className={`${css.pill} ${voiceReady.configured ? css.pillOk : css.pillWarn}`}>
          {voiceReady.configured ? `Deepgram · ${voiceReady.voices.en.name} & ${voiceReady.voices.es.name}` : "Deepgram voice unavailable"}
        </span>
        {!browserVoice.recognition && <span className={`${css.pill} ${css.pillWarn}`}>Microphone unavailable — type a note</span>}
        <span className={`${css.pill} ${css.pillOk}`}>{data.assistantReady.key ? "OpenAI GPT · ready" : "Desk rules · ready"}</span>
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
                disabled={busy === "hear" || voiceBusy}
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
          <DeskAssistant key={assistantEpoch} active={active} profiles={state.profiles} busy={busy === "hear" || voiceBusy} onSend={hear} />
          <div className={css.row}>
            <span className={css.label}>Desk node</span>
            <span className={css.hint} style={{ marginLeft: "auto" }}>
              Arduino · sonar + OLED
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
              <span className={css.oledStatus}>{working || finishingVoice ? "WORKING" : recording ? "LISTENING" : node.armed ? "ARMED" : node.status}</span>
              <span className={node.urgent && node.status === "IDLE" ? css.urgentText : ""}>{node.line}</span>
            </div>
          </div>
          {node.presence && <div className={css.presence}>Someone is at the desk.</div>}
          <div className={css.row}>
            <button type="button" className={`${css.btn} ${css.btnArm}`} onClick={() => nodeEvent("arm")} disabled={working || voiceBusy}>
              Arm
            </button>
            <button type="button" className={css.btn} onClick={() => nodeEvent("disarm")}>
              Disarm
            </button>
          </div>
          <ArduinoNode
            status={offline ? "OFFLINE" : working || finishingVoice ? "WORKING" : recording ? "LISTENING" : node.armed ? "ARMED" : node.status}
            urgent={node.urgent}
            line={offline ? "Desk server unavailable" : working || finishingVoice ? "Working" : recording ? "Listening - speak now" : node.armed ? "Hold hand near sonar or hold to talk" : node.lineAscii}
            onTrigger={() => { if (!document.hidden && !offline) startTalk("sonar"); }}
            onRelease={() => { if (captureSourceRef.current === "sonar") stopTalkRef.current(); }}
            onDisconnect={() => { if (captureSourceRef.current === "sonar") cancelTalk(); }}
          />
          <label className={css.hint} htmlFor="desk-voice-language">Spoken language</label>
          <select id="desk-voice-language" className={css.input} value={voiceLanguage} onChange={(e) => setVoiceLanguage(e.target.value)} disabled={voiceBusy || busy === "hear"}>
            <option value="en-US">English</option>
            <option value="es-US">Español</option>
          </select>
          {recording && captureSource === "sonar" ? (
            <button type="button" className={`${css.ptt} ${css.pttLive}`} onClick={() => void stopTalk()}>
              ● Listening — stop and file
            </button>
          ) : (
            <button
              type="button"
              className={`${css.ptt} ${recording ? css.pttLive : ""}`}
              disabled={!browserVoice.recognition || (!node.armed && !recording) || busy === "hear" || finishingVoice}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                startTalk();
              }}
              onPointerUp={() => stopTalk()}
              onPointerCancel={() => cancelTalk()}
              onBlur={() => { if (holding.current) cancelTalk(); }}
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
              {recording ? "● Listening — release to file" : finishingVoice ? "Finishing transcript…" : node.armed ? "Hold to talk" : "Arm first, then hold to talk"}
            </button>
          )}
          <p className={css.hint}>
            Arm, then hold your hand near the sonar while speaking, or hold to talk. Move your hand at least 30 cm away for one second to stop and file. Browser recognition may end sooner; Disarm cancels capture. The browser recognizes speech. Deepgram speaks the confirmation. Only the transcript goes to the desk.
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
                {spokenRef.current && browserVoice.playback && (
                  <button type="button" className={`${css.btn} ${css.btnGhost} ${css.btnSmall}`} disabled={voiceBusy} onClick={() => {
                    const spoken = spokenRef.current;
                    if (spoken) void speakWithPersonality(spoken.text, spoken.lang, () => flash("Spoken reply is unavailable. The confirmation is shown below."));
                  }}>
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
                disabled={busy === "hear" || voiceBusy}
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
            <button type="button" className={css.scriptBtn} disabled={busy === "hear" || voiceBusy} onClick={() => hear({ text: SCRIPT[0].text, source: "script" })}>
              <span className={css.stepNum}>↻</span>
              <span>
                <strong>Repeat Marisol</strong>Say it again — the desk should answer “Already filed”.
              </span>
            </button>
          </div>
          <div className={css.row}>
            <button type="button" className={`${css.btn} ${css.btnGhost} ${css.btnSmall}`} onClick={reset} disabled={busy === "hear" || voiceBusy}>
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
