"use client";

import { useEffect, useRef, useState } from "react";
import type { AssistantMessage, AssistantMode, DeskState, ExecutiveTask, ProfileId } from "@/lib/desk/types";
import css from "./DeskConsole.module.css";

export type AssistantRequest = { text: string; source: "typed"; mode: AssistantMode; messages: AssistantMessage[] };
type Reply = { ok: boolean; assistant?: { reply: string; tasks: ExecutiveTask[] }; notice?: string | null };
type Turn = AssistantMessage & { tasks?: ExecutiveTask[]; error?: boolean };

export default function DeskAssistant({ active, profiles, busy, onSend }: {
  active: ProfileId;
  profiles: DeskState["profiles"];
  busy: boolean;
  onSend: (payload: AssistantRequest) => Promise<Reply | null>;
}) {
  const [threads, setThreads] = useState<Partial<Record<ProfileId, Turn[]>>>({});
  const [drafts, setDrafts] = useState<Partial<Record<ProfileId, string>>>({});
  const [mode, setMode] = useState<AssistantMode>("chat");
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const thread = threads[active] ?? [];
  const lastTurn = thread.at(-1);
  const draft = drafts[active] ?? "";
  const setDraft = (value: string) => setDrafts((prev) => ({ ...prev, [active]: value }));

  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation) conversation.scrollTop = conversation.scrollHeight;
  }, [active, lastTurn]);

  const send = async (text: string, nextMode: AssistantMode) => {
    if (!text.trim() || busy) return;
    const profile = active;
    const message: Turn = { role: "user", text: text.trim() };
    const messages = thread.filter((m) => !m.error).slice(-12).map(({ role, text, tasks }) => ({ role, text: `${text}${tasks?.length ? `\nProposed tasks: ${JSON.stringify(tasks)}` : ""}`.slice(0, 2400) }));
    setThreads((prev) => ({ ...prev, [profile]: [...(prev[profile] ?? []), message].slice(-24) }));
    setDraft("");
    const response = await onSend({ text: message.text, source: "typed", mode: nextMode, messages });
    const reply: Turn = response?.ok && response.assistant
      ? { role: "assistant", text: response.assistant.reply, tasks: response.assistant.tasks }
      : { role: "assistant", text: response?.notice ?? "The desk could not answer. Please try again.", error: true };
    setThreads((prev) => ({ ...prev, [profile]: [...(prev[profile] ?? []), reply].slice(-24) }));
  };

  return (
    <section className={css.assistant} aria-label="GPT chat and executive tasks">
      <span className={css.label}>Ask or plan · {profiles[active].name}</span>
      <div className={css.row}>
        <select className={css.input} aria-label="Assistant mode" value={mode} disabled={busy} onChange={(e) => setMode(e.target.value as AssistantMode)}>
          <option value="chat">Chat</option>
          <option value="plan">Plan tasks</option>
          <option value="file">File a note</option>
        </select>
        <button type="button" className={`${css.btn} ${css.btnSmall}`} disabled={busy} onClick={() => send("Prioritize my open work for today. Give each task an owner, due date when known, and any approval needed.", "plan")}>
          Plan my day
        </button>
      </div>
      <p className={css.hint}>{mode === "file" ? "Filing updates the boards using the details you provide." : "Ask a question or plan your work. Tasks are proposals until you act on them."}</p>
      {thread.length > 0 && (
        <div ref={conversationRef} className={css.conversation} role="log" aria-label="Conversation with Veridian" aria-live="polite">
          {thread.map((turn, index) => (
            <div key={index} className={turn.role === "user" ? css.userTurn : css.assistantTurn}>
              <strong>{turn.role === "user" ? profiles[active].name : "Veridian"}</strong>
              <p className={turn.error ? css.notice : css.chatText}>{turn.text}</p>
              {turn.tasks?.length ? (
                <ol className={css.taskList}>
                  {turn.tasks.map((task, i) => (
                    <li key={i}>
                      <strong>{task.title}</strong>
                      <span>{profiles[task.owner]?.name ?? task.owner}{task.dueBy ? ` · due ${task.dueBy}` : " · date to confirm"}{task.priority === "urgent" ? " · urgent" : ""}{task.requiresApproval ? " · approval needed" : ""}</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          ))}
        </div>
      )}
      <form className={css.assistant} onSubmit={(e) => { e.preventDefault(); void send(draft, mode); }}>
        <label className={css.hint} htmlFor="desk-message">Message Veridian</label>
        <textarea id="desk-message" className={css.input} rows={3} maxLength={600} value={draft} disabled={busy} onChange={(e) => setDraft(e.target.value)} placeholder={mode === "file" ? "Ana helped for two hours yesterday…" : "What should I focus on today?"} />
        <button type="submit" className={`${css.btn} ${css.btnPrimary}`} disabled={busy || !draft.trim()}>{busy ? "Working…" : mode === "file" ? "File note" : mode === "plan" ? "Plan tasks" : "Send"}</button>
      </form>
    </section>
  );
}
