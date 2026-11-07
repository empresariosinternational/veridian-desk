/**
 * Desk node state machine (docs/node-clip.md, simplified for the desk):
 *
 *   IDLE → ARMED (consent) → LISTENING → WORKING → FILED → IDLE
 *
 * - Arm is the consent step. It opens one capture window (LISTENING, red).
 *   The microphone itself only opens while push-to-talk is held.
 * - WORKING (amber) while OpenAI transcribes/plans and the desk files.
 * - FILED (green) for a moment, then IDLE. Raw audio is dropped at FILED.
 * - Disarm returns to IDLE from anywhere and drops any unfiled audio.
 * - An armed window that is never used expires back to IDLE.
 * - Presence (PIR) only raises a front-desk banner. It never starts capture.
 * - Urgent is an overlay (blink), not a status.
 */

import type { DeskState, NodeState, NodeStatus } from "./types";

export const FILED_HOLD_MS = 2_500;
export const ARM_WINDOW_MS = 120_000;
export const PRESENCE_MS = 90_000;

const LINES = {
  idle: "Veridian Desk",
  listening: "Listening — Tidepath desk",
};

function move(node: NodeState, to: NodeStatus, why: string, now: Date): void {
  if (node.status === to) return;
  node.log = [{ at: now.toISOString(), from: node.status, to, why }, ...node.log].slice(0, 12);
  node.status = to;
  node.statusAt = now.toISOString();
}

function idleLine(node: NodeState): string {
  return node.urgent && node.urgentLine ? node.urgentLine : LINES.idle;
}

export function arm(state: DeskState, now: Date): void {
  const n = state.node;
  if (n.status === "WORKING") return;
  if (n.status !== "IDLE") move(n, "IDLE", "re-arm", now);
  move(n, "ARMED", "consent given (arm)", now);
  move(n, "LISTENING", "capture window open", now);
  n.armedAt = now.toISOString();
  n.line = LINES.listening;
}

export function disarm(state: DeskState, now: Date): void {
  const n = state.node;
  move(n, "IDLE", "disarm — unfiled audio dropped", now);
  n.armedAt = null;
  n.line = idleLine(n);
}

export function presence(state: DeskState, now: Date): void {
  state.node.presenceUntil = new Date(now.getTime() + PRESENCE_MS).toISOString();
}

export function working(state: DeskState, who: string, now: Date): void {
  const n = state.node;
  move(n, "WORKING", `heard ${who}`, now);
  n.line = `Working — ${who}`;
}

export function filed(state: DeskState, line: string, now: Date): void {
  const n = state.node;
  move(n, "FILED", "filed; raw audio dropped", now);
  n.armedAt = null;
  n.line = line;
}

export function failSoft(state: DeskState, line: string, now: Date): void {
  const n = state.node;
  move(n, "IDLE", "fail soft", now);
  n.armedAt = null;
  n.line = line;
}

export function setUrgent(state: DeskState, id: string, line: string): void {
  state.node.urgent = true;
  state.node.urgentId = id;
  state.node.urgentLine = line;
}

export function clearUrgent(state: DeskState, id: string): void {
  if (state.node.urgentId !== id) return;
  state.node.urgent = false;
  state.node.urgentId = null;
  state.node.urgentLine = null;
  if (state.node.status === "IDLE") state.node.line = LINES.idle;
}

/** Time-based transitions, applied lazily on read. Returns true if anything changed. */
export function settle(state: DeskState, now: Date): boolean {
  const n = state.node;
  const since = now.getTime() - new Date(n.statusAt).getTime();
  if (n.status === "FILED" && since >= FILED_HOLD_MS) {
    move(n, "IDLE", "filed → idle", now);
    n.line = idleLine(n);
    return true;
  }
  if (n.status === "LISTENING" && n.armedAt && now.getTime() - new Date(n.armedAt).getTime() >= ARM_WINDOW_MS) {
    move(n, "IDLE", "capture window expired", now);
    n.armedAt = null;
    n.line = idleLine(n);
    return true;
  }
  if (n.status === "WORKING" && since >= 30_000) {
    move(n, "IDLE", "stale work cleared", now);
    n.line = idleLine(n);
    return true;
  }
  if (n.status === "IDLE" && n.line !== idleLine(n) && since >= FILED_HOLD_MS) {
    n.line = idleLine(n);
    return true;
  }
  return false;
}

export type NodeView = {
  status: NodeStatus;
  line: string;
  /** ASCII-only line for MicroPython framebuf fonts. */
  lineAscii: string;
  color: "white" | "red" | "amber" | "green";
  blink: boolean;
  urgent: boolean;
  urgentId: string | null;
  presence: boolean;
  armed: boolean;
};

export function toAscii(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[—–]/g, "-")
    .replace(/[^\x20-\x7e]/g, "");
}

export function nodeView(state: DeskState, now: Date): NodeView {
  const n = state.node;
  const color = n.status === "LISTENING" || n.status === "ARMED" ? "red" : n.status === "WORKING" ? "amber" : n.status === "FILED" ? "green" : "white";
  return {
    status: n.status,
    line: n.line,
    lineAscii: toAscii(n.line),
    color,
    blink: n.urgent,
    urgent: n.urgent,
    urgentId: n.urgentId,
    presence: Boolean(n.presenceUntil && new Date(n.presenceUntil).getTime() > now.getTime()),
    armed: n.status === "LISTENING" || n.status === "ARMED",
  };
}
