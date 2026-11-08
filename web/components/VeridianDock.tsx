"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import VeridianMark from "./VeridianMark";
import { useVeridian } from "./VeridianContext";
import { cancelSpeech, captureSpeech, primeSpokenAudio, speakWithPersonality, speechRecognition, type VoiceCapture } from "@/lib/desk/browser-voice";
import { applyTaskActions, loadTasks, localDay, saveTasks, sortTasks, taskStorageKey, type Message, type Priority, type Suggestion, type Task, type TaskAction } from "@/lib/veridian/tasks";
import type { Lang } from "@/lib/desk/types";

type Reply = { ok: boolean; reply?: string; lang?: Lang; actions?: TaskAction[]; suggestions?: Suggestion[]; provider?: string; notice?: string };
type VoiceState = "idle" | "listening" | "ready" | "finishing";
const LEVELS: Priority[] = ["high", "normal", "low"];

export default function VeridianDock() {
  const { open, setOpen, bridge, pending: pendingAsk } = useVeridian();
  const pathname = usePathname();
  const [tasks, setTasks] = useState<Task[]>(loadTasks);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [newTask, setNewTask] = useState("");
  const [tab, setTab] = useState<"chat" | "tasks">("chat");
  const [busy, setBusy] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState("en-US");
  const [readReplies, setReadReplies] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [persisted, setPersisted] = useState(true);
  const [panelTop, setPanelTop] = useState(76);
  const tasksRef = useRef(tasks);
  const busyRef = useRef(false);
  const captureRef = useRef<VoiceCapture | null>(null);
  const stoppingRef = useRef(false);
  const voiceEpoch = useRef(0);
  const holdingRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const composer = useRef<HTMLTextAreaElement | null>(null);
  const conversation = useRef<HTMLDivElement | null>(null);
  const latestMessage = messages.at(-1);
  const voiceBusy = voiceState !== "idle";
  const pending = sortTasks(tasks).filter((task) => !task.completed);
  const completed = tasks.filter((task) => task.completed);
  const pageName = pathname === "/" ? "your scene" : pathname.startsWith("/crm") ? "CRM" : pathname.startsWith("/desk") ? "the desk" : pathname.startsWith("/social-scene") ? "the pond" : pathname.startsWith("/profile") ? "your profile" : "this page";

  const cancelCapture = useCallback(() => {
    voiceEpoch.current++;
    holdingRef.current = false;
    stoppingRef.current = false;
    captureRef.current?.abort();
    captureRef.current = null;
    setVoiceState("idle");
    cancelSpeech();
  }, []);

  useEffect(() => {
    mounted.current = true;
    setVoiceSupported(Boolean(speechRecognition()));
    const sync = (event: StorageEvent) => {
      if (event.key && event.key !== taskStorageKey()) return;
      tasksRef.current = loadTasks();
      setTasks(tasksRef.current);
    };
    window.addEventListener("storage", sync);
    window.addEventListener("blur", cancelCapture);
    return () => {
      mounted.current = false;
      voiceEpoch.current++;
      captureRef.current?.abort();
      requestRef.current?.abort();
      cancelSpeech();
      window.removeEventListener("storage", sync);
      window.removeEventListener("blur", cancelCapture);
    };
  }, [cancelCapture]);

  useEffect(() => { setPersisted(saveTasks(tasks)); }, [tasks]);

  useEffect(() => {
    if (!open) { cancelCapture(); return; }
    // Desktop has no top bar (the sidebar holds navigation); phones keep a slim one.
    const header = document.querySelector(".os-topbar");
    const position = () => setPanelTop(Math.max(0, header?.getBoundingClientRect().bottom ?? 0) + 12);
    position();
    const observer = new ResizeObserver(position);
    if (header) observer.observe(header);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        document.getElementById("veridian-cta")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    if (composer.current && !composer.current.closest("[hidden]")) composer.current.focus({ preventScroll: true });
    else document.querySelector<HTMLInputElement>("#vcta-tasks input")?.focus({ preventScroll: true });
    return () => { observer.disconnect(); window.removeEventListener("keydown", onKey); };
  }, [open, setOpen, cancelCapture]);

  useEffect(() => {
    if (open && conversation.current) conversation.current.scrollTop = conversation.current.scrollHeight;
  }, [open, latestMessage, busy]);

  const commit = useCallback((actions: TaskAction[]) => {
    const next = applyTaskActions(tasksRef.current, actions);
    tasksRef.current = next;
    setTasks(next);
  }, []);

  const changeTask = (task: Task, patch: Partial<Pick<Task, "title" | "priority" | "dueDate">>) => {
    try { commit([{ type: "update", id: task.id, title: task.title, priority: task.priority, dueDate: task.dueDate, ...patch }]); setNotice(null); }
    catch (error) { setNotice((error as Error).message); }
  };

  const send = async (text: string, mode: "chat" | "plan" = "chat", source: "typed" | "voice" = "typed") => {
    if (!text.trim() || busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setNotice(null); setTab("chat"); cancelSpeech();
    const epoch = voiceEpoch.current;
    const history = messages.filter((message) => !message.error).slice(-12).map(({ role, text, suggestions }) => ({ role, text: `${text}${suggestions?.length ? `\nSuggested tasks: ${JSON.stringify(suggestions)}` : ""}`.slice(0, 2400) }));
    setMessages((previous) => [...previous, { role: "user", text: text.trim() }].slice(-24) as Message[]);
    setDraft("");
    const controller = new AbortController();
    requestRef.current = controller;
    const timer = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch("/api/veridian/chat", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ text: text.trim(), mode, messages: history, tasks: tasksRef.current, today: localDay(), page: pathname.slice(0, 180) }),
      });
      const result = await response.json() as Reply;
      if (!mounted.current) return;
      if (!response.ok || !result.ok || !result.reply) throw new Error(result.notice ?? "I couldn't answer just now. Your tasks haven't changed; please try again.");
      if (result.actions?.length) commit(result.actions);
      if (source === "voice" && readReplies && epoch === voiceEpoch.current) {
        void speakWithPersonality(result.reply, result.lang ?? "en", () => setNotice("Spoken reply is unavailable. You can read the reply above."));
      }
      setMessages((previous) => [...previous, { role: "assistant", text: result.reply, suggestions: result.suggestions ?? [] }].slice(-24) as Message[]);
    } catch (error) {
      if (!mounted.current) return;
      const message = (error as Error).name === "AbortError" ? "That took too long. Your tasks haven't changed; please try again." : (error as Error).message;
      setMessages((previous) => [...previous, { role: "assistant", text: message, error: true }].slice(-24) as Message[]);
      setDraft((current) => current || text);
    } finally {
      clearTimeout(timer);
      requestRef.current = null;
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const startVoice = () => {
    if (busyRef.current || captureRef.current) return;
    primeSpokenAudio();
    setNotice(null); cancelSpeech(); holdingRef.current = true;
    try {
      const capture = captureSpeech(voiceLanguage);
      captureRef.current = capture;
      setVoiceState("listening");
      void capture.result.then((result) => {
        if (captureRef.current !== capture || stoppingRef.current) return;
        if (result.error || result.aborted) {
          captureRef.current = null; setVoiceState("idle"); setNotice(result.error);
        } else setVoiceState("ready");
      });
    } catch (error) { holdingRef.current = false; setNotice((error as Error).message); }
  };

  const stopVoice = async () => {
    holdingRef.current = false;
    const capture = captureRef.current;
    if (!capture || stoppingRef.current) return;
    stoppingRef.current = true;
    setVoiceState("finishing");
    const epoch = voiceEpoch.current;
    capture.stop();
    const result = await capture.result;
    if (epoch !== voiceEpoch.current) return;
    captureRef.current = null; stoppingRef.current = false; setVoiceState("idle");
    if (result.aborted) return;
    if (result.error || !result.text) { setNotice(result.error ?? "I didn't hear anything. Hold to talk, or type your message."); return; }
    await send(result.text, "chat", "voice");
  };

  // Pages reach Veridian through the layout context: Today's dock, next moves, The Pond.
  useEffect(() => {
    bridge.current = {
      submit: (text, source) => { void send(text, "chat", source); },
      addTasks: (actions) => {
        try { commit(actions); return true; }
        catch (error) { setNotice((error as Error).message); return false; }
      },
      showTasks: () => setTab("tasks"),
    };
  });
  useEffect(() => {
    const queued = pendingAsk.current;
    if (!queued) return;
    pendingAsk.current = null;
    void send(queued.text, "chat", queued.source);
  });
  useEffect(() => () => { bridge.current = {}; }, [bridge]);

  const addSuggestion = (task: Suggestion) => {
    try { commit([{ type: "add", id: null, ...task }]); setNotice(null); }
    catch (error) { setNotice((error as Error).message); }
  };

  const taskRow = (task: Task) => (
    <li key={task.id} className={`vcta-task${task.completed ? " is-done" : ""}`}>
      <div className="vcta-task-title">
        <input type="checkbox" checked={task.completed} disabled={busy} aria-label={task.completed ? `Reopen ${task.title}` : `Complete ${task.title}`} onChange={() => commit([{ type: task.completed ? "reopen" : "complete", id: task.id, title: null, priority: null, dueDate: null }])} />
        <span>{task.title}</span>
      </div>
      {!task.completed ? <div className="vcta-task-controls">
        <select aria-label={`Priority for ${task.title}`} value={task.priority} disabled={busy} onChange={(event) => changeTask(task, { priority: event.target.value as Priority })}>
          {LEVELS.map((level) => <option key={level} value={level}>{level === "high" ? "High priority" : level === "low" ? "Low priority" : "Normal priority"}</option>)}
        </select>
        <input type="date" aria-label={`Due date for ${task.title}`} value={task.dueDate ?? ""} disabled={busy} onChange={(event) => changeTask(task, { dueDate: event.target.value || null })} />
      </div> : <button type="button" className="vcta-text-button" disabled={busy} aria-label={`Remove ${task.title}`} onClick={() => { const next = tasksRef.current.filter((item) => item.id !== task.id); tasksRef.current = next; setTasks(next); }}>Remove</button>}
    </li>
  );

  return (
    <aside id="veridian-panel" className="vcta-panel" style={{ top: panelTop }} hidden={!open} role="dialog" aria-label="Veridian assistant" aria-modal={false}>
      <div className="vcta-panel-head">
        <VeridianMark size={30} />
        <div><h2>Veridian</h2><p>Here with you in {pageName}</p></div>
        <button type="button" className="vcta-icon-button" aria-label="Minimize Veridian" onClick={() => { cancelCapture(); setOpen(false); document.getElementById("veridian-cta")?.focus(); }}>−</button>
      </div>
      <div className="vcta-tabs" role="tablist" aria-label="Veridian workspace" onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? "chat" : event.key === "End" ? "tasks" : tab === "chat" ? "tasks" : "chat";
        setTab(next); document.getElementById(`vcta-${next}-tab`)?.focus();
      }}>
        <button id="vcta-chat-tab" type="button" role="tab" tabIndex={tab === "chat" ? 0 : -1} aria-selected={tab === "chat"} aria-controls="vcta-chat" onClick={() => setTab("chat")}>Conversation</button>
        <button id="vcta-tasks-tab" type="button" role="tab" tabIndex={tab === "tasks" ? 0 : -1} aria-selected={tab === "tasks"} aria-controls="vcta-tasks" onClick={() => setTab("tasks")}>My priorities <span>{pending.length}</span></button>
      </div>

      <section id="vcta-chat" className="vcta-chat" role="tabpanel" aria-labelledby="vcta-chat-tab" hidden={tab !== "chat"}>
        <div ref={conversation} className="vcta-conversation" role="log" aria-label="Conversation with Veridian" aria-live="polite" aria-busy={busy}>
          {messages.length === 0 ? <div className="vcta-welcome">
            <span className="vcta-eyebrow">A little clarity, whenever you need it</span>
            <h3>What needs your attention?</h3>
            <p>Talk it through or type a thought. We can sort out what comes next.</p>
            {pending.length > 0 && <div className="vcta-up-next"><span>Up next</span><strong>{pending[0].title}</strong><small>{pending[0].priority === "high" ? "High priority" : "On your list"}{pending[0].dueDate ? ` · ${pending[0].dueDate}` : ""}</small></div>}
          </div> : messages.map((message, index) => <div key={index} className={`vcta-message ${message.role}${message.error ? " has-error" : ""}`}>
            <span>{message.role === "user" ? "You" : "Veridian"}</span>
            <p>{message.text}</p>
            {message.suggestions?.map((suggestion, i) => {
              const added = tasks.some((task) => !task.completed && task.title.toLowerCase() === suggestion.title.toLowerCase() && task.dueDate === suggestion.dueDate);
              return <div key={i} className="vcta-suggestion"><strong>{suggestion.title}</strong><small>{suggestion.priority} priority{suggestion.dueDate ? ` · ${suggestion.dueDate}` : ""}</small><button type="button" disabled={busy || added} aria-label={`Add suggested task: ${suggestion.title}`} onClick={() => addSuggestion(suggestion)}>{added ? "On your list" : "+ Add to my tasks"}</button></div>;
            })}
          </div>)}
          {busy && <p className="vcta-thinking" role="status">Veridian is thinking…</p>}
        </div>
        <div className="vcta-prompts">
          <button type="button" disabled={busy || voiceBusy} onClick={() => void send("Plan my day. What should I focus on next?", "plan")}>Plan my day</button>
          <button type="button" disabled={busy || voiceBusy} onClick={() => { setDraft("Add task: "); composer.current?.focus(); }}>+ Add a task</button>
        </div>
        <form className="vcta-composer" onSubmit={(event) => { event.preventDefault(); if (!voiceBusy) void send(draft); }}>
          <label className="vcta-sr-only" htmlFor="vcta-message">Message Veridian</label>
          <textarea ref={composer} id="vcta-message" rows={2} maxLength={1000} value={draft} disabled={voiceBusy} onChange={(event) => setDraft(event.target.value)} placeholder="A task, a question, a place to start…" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!voiceBusy) void send(draft); } }} />
          <div className="vcta-compose-actions">
            <button type="button" className={`vcta-voice${voiceBusy ? " is-listening" : ""}`} disabled={!voiceSupported || busy || voiceState === "finishing"} aria-label="Hold to talk to Veridian" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); startVoice(); }} onPointerUp={() => void stopVoice()} onPointerCancel={cancelCapture} onBlur={() => { if (holdingRef.current) cancelCapture(); }} onKeyDown={(event) => { if ((event.key === " " || event.key === "Enter") && !event.repeat) { event.preventDefault(); startVoice(); } }} onKeyUp={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); void stopVoice(); } }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></svg>
              {voiceState === "finishing" ? "Finishing…" : voiceBusy ? "Release to send" : "Hold to talk"}
            </button>
            <button type="submit" className="vcta-send" disabled={!draft.trim() || busy || voiceBusy} aria-label="Send message to Veridian">Send ↑</button>
          </div>
        </form>
        <div className="vcta-voice-options">
          <select aria-label="Voice language" value={voiceLanguage} disabled={voiceBusy} onChange={(event) => setVoiceLanguage(event.target.value)}><option value="en-US">English</option><option value="es-US">Español</option></select>
          <button type="button" aria-pressed={readReplies} onClick={() => { setReadReplies(!readReplies); cancelSpeech(); }}>{readReplies ? "Voice replies on" : "Voice replies off"}</button>
          {!voiceSupported && <span>Voice unavailable here. You can still type.</span>}
        </div>
      </section>

      <section id="vcta-tasks" className="vcta-tasks" role="tabpanel" aria-labelledby="vcta-tasks-tab" hidden={tab !== "tasks"}>
        <div className="vcta-task-heading"><div><span className="vcta-eyebrow">Make room for what matters</span><h3>{pending.length ? `${pending.length} open ${pending.length === 1 ? "task" : "tasks"}` : "A clear list"}</h3></div><button type="button" className="vcta-text-button" disabled={busy || voiceBusy} onClick={() => void send("Plan my day. What should I focus on next?", "plan")}>Help me prioritize ↗</button></div>
        <form className="vcta-add-task" onSubmit={(event) => { event.preventDefault(); if (!newTask.trim()) return; try { commit([{ type: "add", id: null, title: newTask.trim(), priority: "normal", dueDate: null }]); setNewTask(""); setNotice(null); } catch (error) { setNotice((error as Error).message); } }}>
          <input aria-label="New task" placeholder="What needs doing?" maxLength={240} value={newTask} disabled={busy} onChange={(event) => setNewTask(event.target.value)} />
          <button type="submit" disabled={busy || !newTask.trim()}>Add</button>
        </form>
        {!pending.length && <p className="vcta-empty">Add a task here, or tell Veridian what you need to get done.</p>}
        <ul className="vcta-task-list">{pending.map(taskRow)}</ul>
        {completed.length > 0 && <details className="vcta-completed"><summary>Completed · {completed.length}</summary><ul className="vcta-task-list">{completed.map(taskRow)}</ul></details>}
      </section>
      {notice && <p className="vcta-notice" role="status">{notice}</p>}
      <p className="vcta-footer">{persisted ? "Your tasks stay saved in this browser. Voice needs no API key." : "Browser storage is blocked. Tasks are kept for this visit."}</p>
    </aside>
  );
}
