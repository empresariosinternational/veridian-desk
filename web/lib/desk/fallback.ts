/**
 * Scripted demo lines → tools, no model.
 *
 * The on-screen buttons send these exact lines through the same pipeline as
 * the microphone (POST /api/desk/hear), so a loud room cannot kill the demo.
 * Each line also carries a pre-parsed plan: if the rules router ever misreads
 * a line, or Deepgram mishears one, the scripted plan still files it.
 */

import { addDays, endOfWorkWeek, lastWeekday, nextWeekday } from "./time";
import type { Lang, ProfileId, ToolCall } from "./types";

export type ScriptLine = {
  id: string;
  step: number;
  speaker: ProfileId;
  label: string;
  text: string;
  lang: Lang;
  optional?: boolean;
  plan: (today: string) => ToolCall[];
};

export const SCRIPT: ScriptLine[] = [
  {
    id: "marisol",
    step: 2,
    speaker: "marisol",
    label: "Marisol · call list",
    text: "This is Marisol. Jordan missed mentoring on Tuesday. Call his mom this week.",
    lang: "en",
    plan: (today) => [
      {
        tool: "fileCaseNote",
        args: { menteeName: "Jordan", missed: "mentoring", missedDate: lastWeekday(today, 2), callWho: "his mom", dueBy: endOfWorkWeek(today) },
      },
    ],
  },
  {
    id: "denise",
    step: 3,
    speaker: "denise",
    label: "Denise · donors",
    text: "This is Denise. Maria Gonzalez is on the donor list twice and has not given since March.",
    lang: "en",
    plan: () => [{ tool: "reviewDonors", args: { nameHint: "Maria Gonzalez", duplicate: true, noGiftSinceMonth: 3 } }],
  },
  {
    id: "yesenia",
    step: 4,
    speaker: "yesenia",
    label: "Yesenia · workshop",
    text: "This is Yesenia. Edison Elementary wants a safety workshop on Thursday in Spanish.",
    lang: "en",
    plan: (today) => [
      { tool: "createWorkshopRequest", args: { school: "Edison Elementary", topic: "safety", date: nextWeekday(today, 4), lang: "es" } },
    ],
  },
  {
    id: "reginald",
    step: 5,
    speaker: "reginald",
    label: "Reginald · session note",
    text: "This is Reginald. Session note: Jordan talked about panic before school. Funder does not need that detail.",
    lang: "en",
    plan: () => [{ tool: "fileClinicalNote", args: { subject: "Jordan Alvarez", body: "Jordan talked about panic before school." } }],
  },
  {
    id: "owen",
    step: 6,
    speaker: "owen",
    label: "Owen · hours + driver",
    text: "This is Owen. Ana volunteered 3 hours yesterday. We need a driver in West Little River today.",
    lang: "en",
    plan: (today) => [
      { tool: "logHours", args: { personName: "Ana", hours: 3, date: addDays(today, -1) } },
      { tool: "openShift", args: { role: "driver", area: "West Little River", date: today, time: null, lang: null } },
    ],
  },
  {
    id: "claudette",
    step: 7,
    speaker: "claudette",
    label: "Claudette · grant draft",
    text: "This is Claudette. Draft the county quarterly update. Only what is true.",
    lang: "en",
    plan: () => [{ tool: "draftGrantUpdate", args: { grantId: "grant-county" } }],
  },
  {
    id: "beatriz",
    step: 8,
    speaker: "beatriz",
    label: "Beatriz · Colony B",
    text: "This is Beatriz. Colony B needs food today.",
    lang: "en",
    plan: (today) => [{ tool: "updateColony", args: { colonyName: "Colony B", need: "food", status: null, date: today } }],
  },
  {
    id: "luis-es",
    step: 9,
    speaker: "luis",
    label: "Luis · en español",
    text: "Soy Luis. Hoy puedo manejar en West Little River.",
    lang: "es",
    optional: true,
    plan: () => [{ tool: "filePersonalNote", args: { personId: "luis" } }],
  },
];

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(text: string): Set<string> {
  return new Set(normalize(text).split(" ").filter((w) => w.length > 1));
}

/** Exact match scores 1. Otherwise word-set overlap (Dice), for misheard demo lines. */
export function matchScripted(text: string): { line: ScriptLine; score: number } | null {
  const n = normalize(text);
  const exact = SCRIPT.find((l) => normalize(l.text) === n);
  if (exact) return { line: exact, score: 1 };
  const w = words(text);
  let best: { line: ScriptLine; score: number } | null = null;
  for (const line of SCRIPT) {
    const lw = words(line.text);
    let shared = 0;
    for (const x of w) if (lw.has(x)) shared++;
    const score = (2 * shared) / (w.size + lw.size || 1);
    if (!best || score > best.score) best = { line, score };
  }
  return best;
}
