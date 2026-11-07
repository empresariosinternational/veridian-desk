/**
 * What may leave which board.
 *
 * - The agent-to-agent network carries PUBLIC_COMMUNITY only, and its text is
 *   built from structured fields (org, kind, area, day), never from raw speech.
 * - assertNetworkSafe() is the second lock: it rejects child or family names,
 *   counseling content, donor amounts, addresses, emails and phone numbers.
 * - Funders get a projection, not a CSS-hidden copy: CLINICAL text never
 *   leaves the server in the funder view.
 */

import type { DataClass, DeskState, Note } from "./types";

export const NETWORK_CLASS: DataClass = "PUBLIC_COMMUNITY";

const COUNSELING_TERMS = [
  "panic",
  "anxiety",
  "anxious",
  "depress",
  "counsel",
  "session note",
  "therapy",
  "therapist",
  "trauma",
  "self-harm",
  "suicid",
  "diagnos",
  "medication",
  "abuse",
];

const MONEY = /(?:\$\s?\d)|(?:\b\d[\d,.]*\s?(?:dollars|usd)\b)/i;
const STREET =
  /\b\d{1,6}\s+(?:[NSEW]{1,2}\.?\s+)?(?:\d{1,3}(?:st|nd|rd|th)\s+|[A-Z][a-z]+\s+){1,3}(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ct|court|ln|lane|way|pl|place|ter|terrace|hwy|highway)\b/i;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
const PHONE = /\b\d{3}[-.\s)]\s?\d{3}[-.\s]\d{4}\b/;

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Names that must never appear on the network: mentees and families (first, last, full). */
export function protectedNames(state: DeskState): string[] {
  const names = new Set<string>();
  for (const m of state.mentees) {
    names.add(m.name);
    for (const part of m.name.split(/\s+/)) if (part.length > 2) names.add(part);
  }
  for (const f of state.families) {
    names.add(f.name.replace(/\s+household$/i, ""));
  }
  return [...names];
}

export function findNetworkViolations(text: string, state: DeskState): string[] {
  const out: string[] = [];
  const plain = stripAccents(text).toLowerCase();
  for (const name of protectedNames(state)) {
    const n = stripAccents(name).toLowerCase();
    if (new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(plain)) out.push(`child or family name (${name})`);
  }
  for (const term of COUNSELING_TERMS) {
    if (plain.includes(term)) {
      out.push("counseling content");
      break;
    }
  }
  if (MONEY.test(text)) out.push("donor or money amount");
  if (STREET.test(text)) out.push("street address");
  if (EMAIL.test(text)) out.push("email address");
  if (PHONE.test(text)) out.push("phone number");
  return out;
}

export type NetworkCheck = { ok: true } | { ok: false; reasons: string[] };

export function assertNetworkSafe(payload: { dataClass: DataClass; texts: string[] }, state: DeskState): NetworkCheck {
  const reasons: string[] = [];
  if (payload.dataClass !== NETWORK_CLASS) reasons.push(`class ${payload.dataClass} cannot leave the desk`);
  for (const t of payload.texts) reasons.push(...findNetworkViolations(t, state));
  return reasons.length ? { ok: false, reasons: [...new Set(reasons)] } : { ok: true };
}

/** The one line a funder may read for a note. */
export function funderLine(note: Note): { text: string; ledgerId: string | null } {
  if (note.dataClass === "CLINICAL") {
    return note.funderView
      ? { text: note.funderView.text, ledgerId: note.funderView.ledgerId }
      : { text: "Counseling session completed", ledgerId: null };
  }
  return { text: "Internal program note — not shared with funders", ledgerId: null };
}

export type FunderView = {
  view: "funder";
  notes: { id: string; at: string; text: string; ledgerId: string | null }[];
  ledger: { id: string; label: string; value: number; unit: "usd" | "count" }[];
};

/** Server-side redaction. Nothing CLINICAL, no names, no donors. */
export function projectForFunder(state: DeskState): FunderView {
  return {
    view: "funder",
    notes: state.notes
      .filter((n) => n.dataClass === "CLINICAL")
      .map((n) => ({ id: n.id, at: n.at, ...funderLine(n) })),
    ledger: Object.values(state.ledger).map(({ id, label, value, unit }) => ({ id, label, value, unit })),
  };
}
