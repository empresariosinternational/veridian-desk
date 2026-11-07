/**
 * Desk router. Chooses tools from the speaker ("This is Marisol") and the
 * utterance when OpenAI is unavailable. Validated GPT plans use the same tools.
 *
 *   utterance → speaker + language → plan (script table or rules) → tools
 *             → say-it-once key → cards → one spoken confirmation
 */

import { matchScripted, normalize } from "./fallback";
import { pushFeed, runPlan } from "./tools";
import { addDays, endOfWorkWeek, lastWeekday, monthIndex, nextWeekday, todayISO, weekdayIndex, weekdayOf } from "./time";
import type { AssistantPlan, CardRef, DeskState, HearInput, HearOutcome, Lang, ProfileId, ToolCall } from "./types";

const PROFILE_BY_NAME: Record<string, ProfileId> = {
  marisol: "marisol",
  denise: "denise",
  yesenia: "yesenia",
  reginald: "reginald",
  owen: "owen",
  claudette: "claudette",
  beatriz: "beatriz",
  ana: "ana",
  luis: "luis",
};

const B2C: ProfileId[] = ["ana", "luis"];

const INTRO =
  /^\s*(?:(?:hi|hello|hey|ok|okay|hola|buenas|good (?:morning|afternoon|evening))[\s,.!]+)?(?:this is|it'?s|it is|i'?m|i am|my name is|soy|habla|le habla|me llamo|aqu[ií](?: habla)?)\s+([a-záéíóúñü]+)\b[\s,.!:;-]*/i;

export function detectSpeaker(text: string): { speaker: ProfileId | null; body: string } {
  const m = text.match(INTRO);
  if (!m) return { speaker: null, body: text.trim() };
  const key = normalize(m[1]);
  const speaker = PROFILE_BY_NAME[key] ?? null;
  return { speaker, body: speaker ? text.slice(m[0].length).trim() : text.trim() };
}

const ES_WORDS = new Set(
  "soy habla hoy ayer manana puedo necesita necesitamos comida para esta estoy gracias colonia manejar llamar mama semana tambien pero porque con una uno el la los las del que en por favor sesion taller escuela".split(" "),
);
const EN_WORDS = new Set("the is and this that we need today has have his her to of on for with call missed wants draft only what true".split(" "));

export function detectLang(text: string): Lang {
  let es = /[ñ¿¡áéíóú]/i.test(text) ? 2 : 0;
  let en = 0;
  for (const w of normalize(text).split(" ")) {
    if (ES_WORDS.has(w)) es++;
    if (EN_WORDS.has(w)) en++;
  }
  return es >= 2 && es > en ? "es" : "en";
}

/* ------------------------------------------------------------- rules */

const STOP_NAMES = new Set(["he", "she", "they", "we", "i", "you", "it", "who", "someone", "mentor", "his", "her", "the", "a"]);
const WEEKDAY = "monday|tuesday|wednesday|thursday|friday|saturday|sunday";
const AREAS = ["West Little River", "Little Havana", "Little River", "Little Haiti", "Liberty City", "Allapattah", "El Portal", "Wynwood", "Overtown", "Hialeah"];

function dayFrom(word: string | undefined, today: string, dir: "past" | "future", fallback: string): string {
  if (!word) return fallback;
  const w = normalize(word).replace(/^(on|this|next|last)\s+/, "");
  if (["today", "tonight", "hoy", "this morning", "this afternoon", "this evening", "morning", "afternoon", "evening"].includes(w)) return today;
  if (["tomorrow", "manana"].includes(w)) return addDays(today, 1);
  if (["yesterday", "ayer"].includes(w)) return addDays(today, -1);
  const wd = weekdayIndex(w);
  if (wd >= 0) {
    if (dir === "past") return weekdayOf(today) === wd ? today : lastWeekday(today, wd);
    return nextWeekday(today, wd);
  }
  return fallback;
}

function langFrom(text: string, fallback: Lang): Lang {
  if (/\b(haitian creole|creole|kreyol|kreyòl)\b/i.test(text)) return "ht";
  if (/\b(spanish|espanol|español)\b/i.test(text)) return "es";
  if (/\benglish\b/i.test(text)) return "en";
  return fallback;
}

const NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

export function parseUtterance(body: string, speaker: ProfileId, today: string, lang: Lang): ToolCall[] {
  const plan: ToolCall[] = [];
  const t = body.trim();

  // Case note + call list: "Jordan missed mentoring on Tuesday. Call his mom this week."
  const missed = t.match(
    new RegExp(`\\b([A-Za-zÁÉÍÓÚáéíóúñ'-]+)\\s+missed\\s+(?:his |her |their |the )?(mentoring|tutoring|counseling|session|class|school)(?:\\s+session)?(?:\\s+(?:on\\s+)?(${WEEKDAY}|yesterday|today))?`, "i"),
  );
  if (missed && !STOP_NAMES.has(missed[1].toLowerCase())) {
    const call = t.match(
      /\bcall\s+(his|her|their|the)\s+(mom|mother|dad|father|parents?|family|grandma|grandmother|grandpa|guardian|aunt|uncle)\b(?:\s+(this week|today|tomorrow|by friday))?/i,
    );
    const due = call?.[3]?.toLowerCase() === "today" ? today : call?.[3]?.toLowerCase() === "tomorrow" ? addDays(today, 1) : endOfWorkWeek(today);
    plan.push({
      tool: "fileCaseNote",
      args: {
        menteeName: titleCase(missed[1]),
        missed: missed[2].toLowerCase(),
        missedDate: missed[3] ? dayFrom(missed[3], today, "past", today) : null,
        callWho: call ? `${call[1]} ${call[2]}`.toLowerCase() : "the family",
        dueBy: due,
      },
    });
  }

  // Donors: duplicates and lapses.
  const dup = /\b(twice|duplicate[ds]?|two records|listed two times|two times|double[- ]listed)\b/i.test(t) && /\b(donor|list|record|crm)\b/i.test(t);
  const lapse = t.match(/\b(?:not|n't|never)\s+(?:given|donated|gave)\s+since\s+([A-Za-z]+)/i);
  if (dup || lapse) {
    const name = t.match(/([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)+)\s+(?:is|was|has|hasn't|had|appears|shows up|gave|donated|stopped)\b/);
    const month = lapse ? monthIndex(lapse[1]) : -1;
    plan.push({
      tool: "reviewDonors",
      args: { nameHint: name?.[1] ?? null, duplicate: dup, noGiftSinceMonth: month >= 0 ? month + 1 : null, text: t },
    });
  }

  // Workshop request: "<School> wants a safety workshop on Thursday in Spanish."
  if (/\bworkshop\b/i.test(t) && !/\bdraft\b/i.test(t)) {
    const school =
      t.match(/\b((?:[A-Z][\w.'-]*\s+){1,3}(?:Elementary|Middle|High|K-8|Academy|School|Center|Library))\b/)?.[1] ??
      titleCase(t.match(/\b((?:\w+\s+){1,2}(?:elementary|middle school|high school|k-8|academy))\b/i)?.[1] ?? "");
    const topic = t.match(/\b(?:a|an)\s+([a-z][a-z\s-]*?)\s+workshop\b/i)?.[1]?.trim().toLowerCase() ?? "safety";
    const day = t.match(new RegExp(`\\b(?:on|this|next)?\\s*(${WEEKDAY}|tomorrow|today)\\b`, "i"))?.[1];
    if (school) {
      plan.push({
        tool: "createWorkshopRequest",
        args: { school: school.trim(), topic, date: dayFrom(day, today, "future", nextWeekday(today, 4)), lang: langFrom(t, lang) },
      });
    }
  }

  // Counseling note: stored once under CLINICAL.
  if (speaker === "reginald" || /\bsession note\b/i.test(t)) {
    const after = t.replace(/^.*?\bsession note\b\s*[:,-]?\s*/i, "");
    const bodyText = after
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => !/\bfunders?\b/i.test(sentence))
      .join(" ")
      .trim();
    if (bodyText) {
      const subject = bodyText.match(/\b([A-Z][a-z]+)\b/)?.[1] ?? null;
      plan.push({ tool: "fileClinicalNote", args: { subject: subject === "Jordan" ? "Jordan Alvarez" : subject, body: bodyText } });
    }
  }

  // Hours: "Ana volunteered 3 hours yesterday."
  const hours = t.match(
    new RegExp(
      `\\b([A-Za-zÁÉÍÓÚáéíóúñ]+)\\s+(?:volunteered|worked|helped|gave|put in|logged)\\s+(?:for\\s+)?(\\d+(?:\\.\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\\s+hours?\\b(?:\\s+(yesterday|today|(?:on|last)\\s+(?:${WEEKDAY})))?`,
      "i",
    ),
  );
  if (hours && !STOP_NAMES.has(hours[1].toLowerCase())) {
    const n = NUM[hours[2].toLowerCase()] ?? parseFloat(hours[2]);
    plan.push({ tool: "logHours", args: { personName: titleCase(hours[1]), hours: n, date: dayFrom(hours[3], today, "past", today) } });
  }

  // Open shift: "We need a driver in West Little River today."
  const shift = t.match(/\b(?:we\s+)?need\s+(?:a|an|one|some)?\s*(driver|mentor|workshop helper|event helper|helper|volunteer|interpreter)s?\b(.*)$/i);
  if (shift) {
    const rest = shift[2];
    const area =
      AREAS.find((a) => new RegExp(`\\b${a}\\b`, "i").test(rest)) ??
      rest.match(/\b(?:in|at|for|to)\s+([A-Z][\w-]*(?:\s+[A-Z][\w-]*){0,3})/)?.[1] ??
      "Location to confirm";
    const day = rest.match(new RegExp(`\\b(today|tonight|tomorrow|this (?:morning|afternoon|evening)|(?:on\\s+)?(?:${WEEKDAY}))\\b`, "i"))?.[1];
    const langNeed = /\b(spanish|creole|kreyol)\b/i.test(rest) ? titleCase(rest.match(/\b(spanish|creole|kreyol)\b/i)![1]) : null;
    plan.push({
      tool: "openShift",
      args: { role: shift[1].toLowerCase(), area, date: dayFrom(day, today, "future", today), time: null, lang: langNeed },
    });
  }

  // Grant / quarterly draft.
  if ((speaker === "claudette" && /\b(draft|quarterly|update|report|grant|application)\b/i.test(t)) || /\bdraft\b.*\b(grant|quarterly|update|report)\b/i.test(t)) {
    plan.push({ tool: "draftGrantUpdate", args: { grantId: "grant-county" } });
  }

  // Colony status: "Colony B needs food today." / "Colonia B necesita comida hoy."
  const colonyNeed = t.match(
    /\b(?:colony|colonia)\s+([A-Za-z0-9]+)\s+(?:needs?|necesita|is out of|ran out of|has no)\s+([a-záéíóúñ ]+?)\s*(today|tonight|tomorrow|hoy|ma[nñ]ana)?\s*[.!]?\s*$/i,
  );
  const colonyStatus = t.match(/\b(?:colony|colonia)\s+([A-Za-z0-9]+)\s+(?:is|was|got|has been|est[aá])\s+(fed|ok|okay|fine|healthy|checked|trapped|vetted|alimentada|bien)\b/i);
  if (colonyNeed) {
    const ES_NEED: Record<string, string> = { comida: "food", agua: "water", medicina: "medicine" };
    const need = colonyNeed[2].trim().toLowerCase();
    plan.push({
      tool: "updateColony",
      args: { colonyName: `Colony ${colonyNeed[1].toUpperCase()}`, need: ES_NEED[need] ?? need, status: null, date: dayFrom(colonyNeed[3], today, "future", today) },
    });
  } else if (colonyStatus) {
    plan.push({
      tool: "updateColony",
      args: { colonyName: `Colony ${colonyStatus[1].toUpperCase()}`, need: null, status: titleCase(colonyStatus[2].toLowerCase()), date: today },
    });
  }

  if (!plan.length && B2C.includes(speaker)) plan.push({ tool: "filePersonalNote", args: { personId: speaker } });
  return plan;
}

/* ---------------------------------------------------------- pipeline */

function uniqueCards(cards: CardRef[]): CardRef[] {
  const seen = new Set<string>();
  return cards.filter((c) => {
    const k = `${c.board}|${c.id}|${c.label}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function filedKey(speaker: ProfileId, day: string, text: string): string {
  return `${speaker}|${day}|${normalize(text)}`;
}

/** File a validated plan, or use offline rules. Network calls happen before the store transaction. */
export function processUtterance(s: DeskState, input: HearInput, assistantPlan?: AssistantPlan): HearOutcome {
  const now = input.now ?? new Date();
  const today = todayISO(now);
  const raw = input.text.replace(/\s+/g, " ").trim().slice(0, 600);
  const empty: HearOutcome = {
    ok: false,
    alreadyFiled: false,
    speaker: "unknown",
    text: raw,
    lang: input.lang ?? "en",
    cards: [],
    say: "",
    spoken: "",
    route: "note",
    scriptId: null,
  };
  if (!raw) return { ...empty, say: "I didn't catch anything. Hold the button and try again, or use a scripted line." };

  const detected = detectSpeaker(raw);
  let speaker: ProfileId | null = detected.speaker ?? input.profileHint ?? null;
  let lang: Lang = input.lang ?? detectLang(raw);
  let canonical = raw;
  let plan: ToolCall[] = [];
  let route: HearOutcome["route"] = "rules";
  let scriptId: string | null = null;

  const scripted = matchScripted(raw);
  const useScript = () => {
    plan = scripted.line.plan(today);
    canonical = scripted.line.text;
    speaker = scripted.line.speaker;
    lang = scripted.line.lang;
    scriptId = scripted.line.id;
    route = "script";
  };
  if (assistantPlan) {
    plan = assistantPlan.actions;
    lang = assistantPlan.lang;
    route = "gpt";
    if (scripted?.score === 1) scriptId = scripted.line.id;
  } else if (scripted && scripted.score === 1) {
    useScript();
  } else {
    if (speaker) plan = parseUtterance(detected.body, speaker, today, lang);
    // A misheard demo line still files through its scripted plan.
    if (!plan.length && scripted && scripted.score >= 0.8) useScript();
    if (!plan.length && speaker) {
      plan = [{ tool: B2C.includes(speaker) ? "filePersonalNote" : "fileGeneralNote", args: {} }];
      route = "note";
    }
  }
  if (!speaker) {
    return { ...empty, lang, say: "Say who is speaking first — for example “This is Owen…” — or pick a profile." };
  }

  // Questions and planning responses never create a filed record or a note.
  if (assistantPlan && !plan.length) {
    return { ...empty, ok: true, speaker, lang, say: assistantPlan.reply, spoken: assistantPlan.reply.slice(0, 400), route: "gpt", scriptId: null };
  }

  const key = filedKey(speaker, today, canonical);
  const prior = s.filed[key];
  const es = lang === "es";
  if (prior) {
    pushFeed(s, { at: now.toISOString(), speaker, text: `Already filed: “${canonical}”`, lang, cards: prior.cards, via: input.source });
    return {
      ok: true,
      alreadyFiled: true,
      speaker,
      text: canonical,
      lang,
      cards: prior.cards,
      say: "Already filed. Said once, filed once — nothing was doubled.",
      spoken: es ? "Ya está anotado." : "Already filed.",
      route,
      scriptId,
    };
  }

  const body = detectSpeaker(canonical).body || canonical;
  const results = runPlan(s, plan, { now, today, speaker, text: canonical, body, lang, filedKey: key });
  const cards = uniqueCards(results.flatMap((r) => r.cards));
  const alreadyFiled = results.length > 0 && results.every((r) => r.deduped);
  const say = alreadyFiled ? "Already filed. Said once, filed once — nothing was doubled." : results.map((r) => r.say).join(" ");
  const spoken = alreadyFiled ? (es ? "Ya está anotado." : "Already filed.") : results.map((r) => r.spoken).join(" ");

  s.filed[key] = { key, at: now.toISOString(), speaker, text: canonical, lang, cards, spoken };
  pushFeed(s, { at: now.toISOString(), speaker, text: alreadyFiled ? `Already filed: “${canonical}”` : say, lang, cards, via: input.source });

  return { ok: true, alreadyFiled, speaker, text: canonical, lang, cards, say, spoken, route, scriptId };
}
