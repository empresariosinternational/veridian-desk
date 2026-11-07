/**
 * Desk tools. Plain functions over the desk state: they file the work and
 * return the cards they changed. They never call a model.
 *
 * Say-it-once lives at two levels: the pipeline keys each utterance
 * (normalized text + speaker + day), and every tool keys the facts it writes
 * (an hours entry, a call, a shift), so a reworded repeat does not double
 * hours, notes or gifts either.
 */

import { createProposal, resolveProposal } from "@/lib/social-scene/agent-protocol";
import { emptySocialStore } from "@/lib/social-scene/store";
import { enforceLedger, checkFunderRule, fmtUSD, type LedgerCheck } from "./ledger";
import { clearUrgent, setUrgent } from "./node";
import { assertNetworkSafe } from "./privacy";
import { daysBetween, fmtDate, fmtDay, giveMiamiDay, isWeekend } from "./time";
import type {
  CardRef,
  Colony,
  DeskState,
  Donor,
  DraftParagraph,
  FeedItem,
  GrantDraft,
  Lang,
  Mentee,
  NetworkMatch,
  OrgId,
  Profile,
  ProfileId,
  PublicNeed,
  ToolCall,
  ToolCtx,
  ToolName,
  ToolResult,
} from "./types";

/* ------------------------------------------------------------ helpers */

let counter = 0;
export function uid(prefix: string): string {
  counter = (counter + 1) % 1_000;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const LANG_NAME: Record<Lang, string> = { en: "English", es: "Spanish", ht: "Haitian Creole" };

export function dayWord(date: string, today: string): string {
  if (date === today) return "today";
  const d = daysBetween(today, date);
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return fmtDay(date);
}

function bump(s: DeskState, ledgerId: string, delta: number, now: Date): number {
  const e = s.ledger[ledgerId];
  if (!e) return 0;
  e.value += delta;
  e.updatedAt = now.toISOString();
  return e.value;
}

export function pushFeed(s: DeskState, item: Omit<FeedItem, "id">): void {
  s.feed = [{ id: uid("feed"), ...item }, ...s.feed].slice(0, 40);
}

function firstName(full: string): string {
  return full.split(/\s+/)[0] ?? full;
}

function personByName(s: DeskState, name: string): Profile | null {
  const n = slug(name);
  return (
    Object.values(s.profiles).find((p) => slug(p.name) === n || slug(p.fullName) === n || slug(firstName(p.fullName)) === n) ??
    null
  );
}

function findMentee(s: DeskState, name: string): Mentee | null {
  const n = slug(name);
  return s.mentees.find((m) => slug(m.name) === n || slug(firstName(m.name)) === n) ?? null;
}

function orgName(s: DeskState, id: OrgId): string {
  return s.orgs[id]?.name ?? id;
}

function possessive(name: string): string {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

/* -------------------------------------------------------------- tools */

type CaseNoteArgs = { menteeName: string; missed: string; missedDate: string | null; callWho: string; dueBy: string };

function fileCaseNote(s: DeskState, a: CaseNoteArgs, ctx: ToolCtx): ToolResult {
  let mentee = findMentee(s, a.menteeName);
  if (!mentee) {
    mentee = { id: `mentee-${slug(a.menteeName)}`, name: a.menteeName, area: "—", school: "School not on file", guardian: a.callWho };
    s.mentees.push(mentee);
  }
  const first = firstName(mentee.name);
  const relation = a.callWho.replace(/^(his|her|their|the)\s+/i, "");
  const who = `${first}'s ${relation}`;
  const reason = `Missed ${a.missed}${a.missedDate ? ` on ${fmtDay(a.missedDate)}` : ""}`;
  const callKey = `call|${slug(mentee.name)}|${a.dueBy}`;
  const noteKey = `case|${slug(mentee.name)}|${a.missedDate ?? ctx.today}`;
  const cards: CardRef[] = [];
  let deduped = true;

  let note = s.notes.find((n) => n.filedKey === noteKey);
  if (!note) {
    note = {
      id: uid("note"),
      at: ctx.now.toISOString(),
      author: ctx.speaker,
      board: "calls",
      dataClass: "OPERATIONAL",
      lang: ctx.lang,
      text: ctx.body,
      subject: mentee.name,
      filedKey: noteKey,
    };
    s.notes.unshift(note);
    deduped = false;
  }
  cards.push({ board: "calls", id: note.id, label: "Case note" });

  let call = s.calls.find((c) => c.entityKey === callKey && c.status === "open");
  if (!call) {
    call = {
      id: uid("call"),
      who,
      about: mentee.name,
      school: mentee.school,
      reason,
      dueBy: a.dueBy,
      lang: null,
      status: "open",
      createdAt: ctx.now.toISOString(),
      createdBy: ctx.speaker,
      entityKey: callKey,
    };
    s.calls.unshift(call);
    bump(s, "q4-missed-session-followups", 1, ctx.now);
    deduped = false;
  }
  cards.push({ board: "calls", id: call.id, label: `Call ${who}` });
  cards.push({ board: "calls", id: "ledger:q4-missed-session-followups", label: "Quarterly report" });

  const followups = s.ledger["q4-missed-session-followups"]?.value ?? 0;
  return {
    cards,
    deduped,
    say: `Case note filed once. ${who} is on this week's call list (due ${fmtDay(a.dueBy)}). Quarterly report: ${followups} follow-up call${followups === 1 ? "" : "s"} this quarter.`,
    spoken: `Filed once. ${who} is on this week's call list.`,
  };
}

type DonorArgs = { nameHint: string | null; duplicate?: boolean; noGiftSinceMonth: number | null; text?: string };

function donorKey(d: Donor): string {
  return `${slug(d.name)}|${d.email.toLowerCase()}`;
}

export function lastGift(d: Donor): string | null {
  return d.gifts.length ? [...d.gifts].sort((x, y) => (x.date < y.date ? 1 : -1))[0].date : null;
}

export function isLapsed(d: Donor, today: string): boolean {
  const last = lastGift(d);
  return !last || daysBetween(last, today) >= 180;
}

function donorsNamedIn(s: DeskState, text: string): Donor[] {
  const t = `-${slug(text)}-`;
  return s.donors.filter((d) => t.includes(`-${slug(d.name)}-`));
}

function claimNote(month: number | null, last: string | null): string {
  return month && last && parseInt(last.slice(5, 7), 10) !== month ? ` Note: the records show the last gift on ${fmtDate(last)}.` : "";
}

function reviewDonors(s: DeskState, a: DonorArgs, ctx: ToolCtx): ToolResult {
  const gmd = giveMiamiDay(ctx.today);
  const named = a.nameHint ? s.donors.filter((d) => slug(d.name) === slug(a.nameHint)) : [];
  const targets = named.length ? named : a.text ? donorsNamedIn(s, a.text) : [];
  const targetKeys = new Set(targets.map(donorKey));

  if (a.duplicate !== false) {
    const groups = new Map<string, Donor[]>();
    for (const d of s.donors) groups.set(donorKey(d), [...(groups.get(donorKey(d)) ?? []), d]);
    let dupes = [...groups.values()].filter((g) => g.length > 1);
    if (targets.length) dupes = dupes.filter((g) => targetKeys.has(donorKey(g[0])));

    if (dupes.length) {
      const cards: CardRef[] = [];
      const merged: Donor[] = [];
      for (const group of dupes) {
        const canonical = [...group].sort(
          (x, y) => y.gifts.length - x.gifts.length || Number(/[^\x00-\x7f]/.test(y.name)) - Number(/[^\x00-\x7f]/.test(x.name)),
        )[0];
        const accented = group.find((d) => /[^\x00-\x7f]/.test(d.name))?.name ?? canonical.name;
        const gifts = new Map<string, Donor["gifts"][number]>();
        for (const d of group) for (const g of d.gifts) gifts.set(g.id, g);
        const result: Donor = {
          ...canonical,
          name: accented,
          email: canonical.email.toLowerCase(),
          gifts: [...gifts.values()].sort((x, y) => (x.date < y.date ? -1 : 1)),
          mergedFrom: group.filter((d) => d.id !== canonical.id).map((d) => `${d.name} (${d.source})`),
          mergedAt: ctx.now.toISOString(),
          flaggedBy: ctx.speaker,
        };
        s.donors = [result, ...s.donors.filter((d) => !group.includes(d))];
        merged.push(result);
        cards.push({ board: "donors", id: result.id, label: `Merged ${result.name}` });
      }
      const main = merged[0];
      const last = lastGift(main);
      const lapsed = isLapsed(main, ctx.today);
      if (lapsed) cards.push({ board: "donors", id: `lapse:${main.id}`, label: "Call before Give Miami Day" });
      s.notes.unshift({
        id: uid("note"),
        at: ctx.now.toISOString(),
        author: ctx.speaker,
        board: "donors",
        dataClass: "DONOR",
        lang: ctx.lang,
        text: `${main.name} was on the donor list twice. Merged into one record.${last ? ` Last gift on file: ${fmtDate(last)}.` : ""}`,
        subject: main.name,
        filedKey: ctx.filedKey,
      });
      return {
        cards,
        deduped: false,
        say: `Merged ${main.name}: ${main.mergedFrom.length + 1} records → 1, each gift counted once.${
          lapsed && last ? ` No gift since ${fmtDate(last)} — call before Give Miami Day (${fmtDay(gmd.date)}, ${gmd.daysAway} days).` : ""
        }${claimNote(a.noGiftSinceMonth, last)}`,
        spoken: `Merged ${main.name} into one record.${lapsed ? " Call her before Give Miami Day." : ""}`,
      };
    }
    if (a.duplicate && targets[0]) {
      return {
        cards: [{ board: "donors", id: targets[0].id, label: "Donor" }],
        deduped: true,
        say: `Already one record: ${targets[0].name}.`,
        spoken: `${targets[0].name} is already on the list once.`,
      };
    }
  }

  // Lapse check on a named donor, no merge.
  const donor = targets[0];
  if (!donor) {
    return { cards: [], deduped: true, say: "I couldn't find that donor on the list.", spoken: "I couldn't find that donor." };
  }
  const last = lastGift(donor);
  if (!isLapsed(donor, ctx.today)) {
    return {
      cards: [{ board: "donors", id: donor.id, label: donor.name }],
      deduped: false,
      say: `${donor.name}: last gift on ${last ? fmtDate(last) : "—"} — not lapsed.${claimNote(a.noGiftSinceMonth, last)}`,
      spoken: `${donor.name} gave recently.`,
    };
  }
  const already = donor.flaggedBy === ctx.speaker;
  donor.flaggedBy = ctx.speaker;
  return {
    cards: [{ board: "donors", id: `lapse:${donor.id}`, label: "Call before Give Miami Day" }],
    deduped: already,
    say: `${donor.name}: no gift since ${last ? fmtDate(last) : "—"} — call before Give Miami Day (${fmtDay(gmd.date)}, ${gmd.daysAway} days).${claimNote(
      a.noGiftSinceMonth,
      last,
    )}`,
    spoken: `Call ${firstName(donor.name)} before Give Miami Day.`,
  };
}

type WorkshopArgs = { school: string; topic: string; date: string; lang: Lang };

function createWorkshopRequest(s: DeskState, a: WorkshopArgs, ctx: ToolCtx): ToolResult {
  const key = `workshop|${slug(a.school)}|${a.date}|${slug(a.topic)}`;
  const existing = s.workshops.find((w) => w.entityKey === key);
  const lang = LANG_NAME[a.lang];
  if (existing) {
    return {
      cards: [{ board: "workshops", id: existing.id, label: `${existing.school} workshop` }],
      deduped: true,
      say: `Already filed: ${existing.school}, ${existing.topic} workshop, ${fmtDay(existing.date)}.`,
      spoken: "That workshop request is already filed.",
    };
  }
  const w = {
    id: uid("ws"),
    school: a.school,
    topic: a.topic,
    lang: a.lang,
    date: a.date,
    status: "slides-pending" as const,
    checklist: [
      { id: "logged", label: `Request logged from ${s.profiles[ctx.speaker]?.name ?? "staff"}`, owner: "Desk", done: true },
      { id: "send", label: `Send ${lang} slides to ${a.school} for approval`, owner: "Yesenia — needs your OK to send", done: false },
      { id: "approve", label: "School approves the slides", owner: a.school, done: false },
      { id: "presenter", label: `${lang}-speaking presenter confirmed`, owner: "Program team", done: false },
      { id: "confirm", label: "Confirmation sent to the school", owner: "Desk, after your OK", done: false },
    ],
    requestedBy: ctx.speaker,
    createdAt: ctx.now.toISOString(),
    entityKey: key,
  };
  s.workshops.unshift(w);
  return {
    cards: [{ board: "workshops", id: w.id, label: `${a.school} workshop` }],
    deduped: false,
    say: `Workshop card: ${a.school}, ${a.topic} workshop, ${fmtDay(a.date)}, in ${lang}. Status: slides pending. Next step and owner are on the checklist.`,
    spoken: `${a.school} workshop card is ready. Slides pending approval.`,
  };
}

type ClinicalArgs = { subject: string | null; body: string };

function fileClinicalNote(s: DeskState, a: ClinicalArgs, ctx: ToolCtx): ToolResult {
  const existing = s.notes.find(
    (n) => n.dataClass === "CLINICAL" && n.author === ctx.speaker && slug(n.text) === slug(a.body) && n.at.slice(0, 10) === ctx.now.toISOString().slice(0, 10),
  );
  if (existing) {
    return {
      cards: [{ board: "notes", id: existing.id, label: "Counseling note" }],
      deduped: true,
      say: "Already filed: that session note exists once.",
      spoken: "That note is already filed.",
    };
  }
  const note = {
    id: uid("note"),
    at: ctx.now.toISOString(),
    author: ctx.speaker,
    board: "notes" as const,
    dataClass: "CLINICAL" as const,
    lang: ctx.lang,
    text: a.body,
    subject: a.subject ?? undefined,
    funderView: { text: "School-based counseling session completed", ledgerId: "q4-counseling-sessions" },
    filedKey: ctx.filedKey,
  };
  s.notes.unshift(note);
  bump(s, "q4-counseling-sessions", 1, ctx.now);
  return {
    cards: [
      { board: "notes", id: note.id, label: "Counseling note (CLINICAL)" },
      { board: "notes", id: `funder:${note.id}`, label: "Funder view" },
    ],
    deduped: false,
    say: "Session note stored once under CLINICAL. Funder view shows only “School-based counseling session completed” · ledger q4-counseling-sessions.",
    spoken: "Session note stored once. The funder sees only that the session happened.",
  };
}

type HoursArgs = { personName: string; hours: number; date: string };

function logHours(s: DeskState, a: HoursArgs, ctx: ToolCtx): ToolResult {
  const person = personByName(s, a.personName);
  if (!person) return fileGeneralNote(s, {}, ctx);
  const key = `hours|${person.id}|${a.date}|${a.hours}`;
  const existing = s.hours.find((h) => h.entityKey === key);
  const name = person.fullName;
  if (existing) {
    return {
      cards: [{ board: "person", id: existing.id, label: `${person.name}'s hours` }],
      deduped: true,
      say: `Already counted: ${name}, ${a.hours} hours on ${fmtDay(a.date)}.`,
      spoken: `${person.name}'s hours are already counted.`,
    };
  }
  const entry = { id: uid("hrs"), personId: person.id, hours: a.hours, date: a.date, loggedBy: ctx.speaker, at: ctx.now.toISOString(), entityKey: key };
  s.hours.unshift(entry);
  s.notes.unshift({
    id: uid("note"),
    at: ctx.now.toISOString(),
    author: ctx.speaker,
    board: "person",
    dataClass: "OPERATIONAL",
    lang: ctx.lang,
    text: `${a.hours} volunteer hours on ${fmtDay(a.date)} — logged by ${s.profiles[ctx.speaker]?.name ?? "staff"} (Tidepath).`,
    subject: person.id,
    filedKey: key,
  });
  return {
    cards: [
      { board: "staffing", id: entry.id, label: `${person.name}: ${a.hours} hours` },
      { board: "person", id: entry.id, label: `${person.name}'s desk` },
    ],
    deduped: false,
    say: `${name}: ${a.hours} hours on ${fmtDay(a.date)}, counted once.`,
    spoken: `${person.name}'s hours are counted once.`,
  };
}

type ShiftArgs = { role: string; area: string; date: string; time: string | null; lang: string | null };

function fits(p: Profile, role: string, area: string, date: string): boolean {
  if (p.side !== "B2C" || !p.offer) return false;
  const roleOk = p.offer.roles.some((r) => slug(r) === slug(role));
  const areaOk = p.offer.areas.some((x) => slug(x) === slug(area));
  const when = isWeekend(date) ? "weekends" : "weekdays";
  const timeOk = p.offer.availability.includes(when);
  return roleOk && areaOk && timeOk;
}

function openShift(s: DeskState, a: ShiftArgs, ctx: ToolCtx): ToolResult {
  const key = `shift|tidepath|${slug(a.role)}|${slug(a.area)}|${a.date}`;
  const when = dayWord(a.date, ctx.today);
  let shift = s.shifts.find((x) => x.entityKey === key);
  let deduped = true;
  if (!shift) {
    shift = {
      id: uid("shift"),
      orgId: "tidepath",
      role: a.role,
      area: a.area,
      date: a.date,
      time: a.time ?? (a.date === ctx.today ? "Today — time set with the driver" : "Time set with the driver"),
      lang: a.lang ?? "Any",
      status: "open",
      filledBy: null,
      urgent: a.date === ctx.today,
      routedTo: ["owen"],
      createdBy: ctx.speaker,
      createdAt: ctx.now.toISOString(),
      sharedWith: null,
      entityKey: key,
    };
    s.shifts.unshift(shift);
    deduped = false;
  }
  if (shift.urgent && shift.status === "open") setUrgent(s, shift.id, `URGENT: ${a.role} ${when}`);

  const cards: CardRef[] = [{ board: "staffing", id: shift.id, label: `${a.role[0].toUpperCase()}${a.role.slice(1)} shift — ${when}` }];

  // Recruiting (B2C): only people who already offered exactly this.
  const recruited: string[] = [];
  for (const p of Object.values(s.profiles)) {
    if (!fits(p, a.role, a.area, a.date)) continue;
    if (s.recruits.some((r) => r.shiftId === shift.id && r.personId === p.id)) continue;
    const r = {
      id: uid("rec"),
      shiftId: shift.id,
      personId: p.id,
      orgId: "tidepath" as const,
      reason: `You offered to drive in ${a.area} on ${isWeekend(a.date) ? "weekends" : "weekdays"}, and this run is ${when}.`,
      status: "pending" as const,
      createdAt: ctx.now.toISOString(),
      respondedAt: null,
    };
    s.recruits.unshift(r);
    recruited.push(p.fullName);
    cards.push({ board: "recruiting", id: r.id, label: `Asked ${p.name}` });
    cards.push({ board: "person", id: r.id, label: `${p.name}: shift offer` });
    deduped = false;
  }

  // Networking (B2B): post the public part of the need.
  const isDriver = slug(a.role) === "driver";
  const need = upsertNeed(
    s,
    {
      orgId: "tidepath",
      kind: isDriver ? "driver-run" : "shift",
      text: isDriver
        ? `${orgName(s, "tidepath")}: volunteer driver run in ${a.area}, ${when}.`
        : `${orgName(s, "tidepath")}: ${a.role} needed in ${a.area}, ${when}.`,
      area: a.area,
      date: a.date,
      entityKey: `need|tidepath|${slug(a.role)}|${slug(a.area)}|${a.date}`,
    },
    ctx,
  );
  if (need.created) deduped = false;
  if (need.need) cards.push({ board: "network", id: need.need.id, label: "Public need posted" });
  const matches = proposeMatches(s, ctx.now, ctx.today);
  for (const m of matches) cards.push({ board: "network", id: m.id, label: "Match proposed" });

  const pending = s.recruits.filter((r) => r.shiftId === shift.id && r.status === "pending").map((r) => s.profiles[r.personId]?.fullName);
  return {
    cards,
    deduped,
    say: `${a.role[0].toUpperCase()}${a.role.slice(1)} shift open: ${a.area}, ${when}${shift.urgent ? " — urgent, routed to Owen" : ""}.${
      pending.length ? ` Offered to ${pending.join(", ")} — waiting for an answer.` : " No one has offered this yet; it stays open."
    }`,
    spoken: pending.length
      ? `${a.role[0].toUpperCase()}${a.role.slice(1)} shift offered to ${pending.map((n) => firstName(n)).join(" and ")}.`
      : `${a.role[0].toUpperCase()}${a.role.slice(1)} shift posted.`,
  };
}

type GrantArgs = { grantId: string };

export function buildGrantDraft(s: DeskState, grantId: string, now: Date, by: ProfileId): GrantDraft {
  const grant = s.grants.find((g) => g.id === grantId) ?? s.grants[0];
  const L = s.ledger;
  const v = (id: string) => L[id]?.value ?? 0;
  const raw: DraftParagraph[] = [
    { text: s.voiceGuide.samples[0], cites: [] },
    {
      text: `In Q3 we held ${v("q3-mentoring-sessions")} mentoring sessions and ${v("q3-workshops")} safety and mental health workshops in schools.`,
      cites: ["q3-mentoring-sessions", "q3-workshops"],
    },
  ];
  const f = v("q4-missed-session-followups");
  if (f > 0) {
    raw.push({
      text: `When a child misses mentoring, we call the family that same week. This quarter we have opened ${f} follow-up call${f === 1 ? "" : "s"} so far.`,
      cites: ["q4-missed-session-followups"],
    });
  }
  raw.push({
    text: `Spending: ${fmtUSD(v(grant.spentLedgerId))} of the ${fmtUSD(v(grant.awardLedgerId))} award so far, all on workshops and mentoring.`,
    cites: [grant.spentLedgerId, grant.awardLedgerId],
  });
  raw.push({ text: `Funder rule: ${grant.rule}`, cites: [] });

  const removed: string[] = [];
  const figures: GrantDraft["figures"] = [];
  const paragraphs = raw.map((p) => {
    const check: LedgerCheck = enforceLedger(p.text, L, { cites: p.cites });
    removed.push(...check.removed);
    figures.push(...check.figures);
    return { text: check.text, cites: p.cites };
  });
  return {
    id: uid("draft"),
    grantId: grant.id,
    title: `${grant.name} — quarterly update (draft)`,
    createdAt: now.toISOString(),
    requestedBy: by,
    paragraphs,
    removed,
    figures,
  };
}

function draftGrantUpdate(s: DeskState, a: GrantArgs, ctx: ToolCtx): ToolResult {
  const draft = buildGrantDraft(s, a.grantId, ctx.now, ctx.speaker);
  const grant = s.grants.find((g) => g.id === draft.grantId);
  const prev = s.drafts.find((d) => d.grantId === draft.grantId);
  if (prev && JSON.stringify(prev.paragraphs) === JSON.stringify(draft.paragraphs)) {
    return {
      cards: [{ board: "grants", id: prev.id, label: "Quarterly draft" }],
      deduped: true,
      say: "Already drafted — nothing in the ledger changed since the last draft.",
      spoken: "That draft is already up to date.",
    };
  }
  s.drafts = [draft, ...s.drafts].slice(0, 3);
  return {
    cards: [{ board: "grants", id: draft.id, label: "County quarterly draft" }],
    deduped: false,
    say: `Draft ready in Tidepath's plain voice. ${draft.figures.length} figures, each cited to the truth ledger${
      draft.removed.length ? `; ${draft.removed.length} removed — not in the ledger` : ""
    }. Spend line follows the rule: ${grant?.rule ?? ""}`,
    spoken: "Draft ready. Every number comes from the ledger.",
  };
}

type ColonyArgs = { colonyName: string; need: string | null; status: string | null; date: string };

function updateColony(s: DeskState, a: ColonyArgs, ctx: ToolCtx): ToolResult {
  let colony: Colony | undefined = s.colonies.find((c) => slug(c.name) === slug(a.colonyName));
  if (!colony) {
    colony = {
      id: `colony-${slug(a.colonyName).replace(/^colony-/, "")}`,
      orgId: "mangrove",
      name: a.colonyName,
      area: "Miami-Dade",
      status: "Unknown",
      need: null,
      updatedAt: null,
      updatedBy: null,
      matchedWith: null,
      dataClass: "PUBLIC_COMMUNITY",
    };
    s.colonies.push(colony);
  }
  const when = dayWord(a.date, ctx.today);
  const status = a.need ? `Needs ${a.need} — ${when}` : a.status ?? "Checked";
  const same = colony.status === status && colony.updatedAt?.slice(0, 10) === ctx.now.toISOString().slice(0, 10);
  colony.status = status;
  colony.need = a.need;
  colony.updatedAt = ctx.now.toISOString();
  colony.updatedBy = ctx.speaker;
  const cards: CardRef[] = [{ board: "colony", id: colony.id, label: colony.name }];
  let deduped = same;
  if (!a.need) {
    for (const n of s.needs) if (n.status === "open" && n.entityKey.includes(`|${colony.id}|`)) n.status = "closed";
  }

  let matchNote = "";
  if (a.need) {
    const posted = upsertNeed(
      s,
      {
        orgId: colony.orgId,
        kind: "food-run",
        text: `${orgName(s, colony.orgId)}: ${colony.name} needs ${a.need} ${when} (${colony.area}).`,
        area: colony.area,
        date: a.date,
        entityKey: `need|${colony.orgId}|food-run|${colony.id}|${a.date}`,
      },
      ctx,
    );
    if (posted.created) deduped = false;
    if (posted.need) cards.push({ board: "network", id: posted.need.id, label: "Public need posted" });
    const matches = proposeMatches(s, ctx.now, ctx.today);
    for (const m of matches) cards.push({ board: "network", id: m.id, label: "Match proposed" });
    if (matches.length) matchNote = " Match proposed with Tidepath's same-day run — both orgs must accept.";
  }
  return {
    cards,
    deduped,
    say: `${colony.name}: ${status.toLowerCase()}. The Mangrove team sees it now${a.need ? "; posted to the network as PUBLIC_COMMUNITY" : ""}.${matchNote}`,
    spoken: a.need ? `${colony.name} needs ${a.need} ${when}. Posted to the network.` : `${colony.name} updated.`,
  };
}

type PersonalArgs = { personId?: ProfileId };

function filePersonalNote(s: DeskState, a: PersonalArgs, ctx: ToolCtx): ToolResult {
  const personId = a.personId ?? ctx.speaker;
  const existing = s.notes.find((n) => n.filedKey === ctx.filedKey);
  const es = ctx.lang === "es";
  if (existing) {
    return { cards: [{ board: "person", id: existing.id, label: "Personal note" }], deduped: true, say: "Already filed.", spoken: es ? "Ya está anotado." : "Already filed." };
  }
  const note = {
    id: uid("note"),
    at: ctx.now.toISOString(),
    author: ctx.speaker,
    board: "person" as const,
    dataClass: "OPERATIONAL" as const,
    lang: ctx.lang,
    text: ctx.body,
    subject: personId,
    filedKey: ctx.filedKey,
  };
  s.notes.unshift(note);
  const name = s.profiles[personId]?.name ?? "your";
  return {
    cards: [{ board: "person", id: note.id, label: `${name}'s note (${ctx.lang})` }],
    deduped: false,
    say: es ? `Anotado una vez en el escritorio de ${name} (español).` : `Filed once on ${name}'s desk.`,
    spoken: es ? "Anotado una vez en tu escritorio." : "Filed once on your desk.",
  };
}

function fileGeneralNote(s: DeskState, _a: Record<string, unknown>, ctx: ToolCtx): ToolResult {
  const existing = s.notes.find((n) => n.filedKey === ctx.filedKey);
  const profile = s.profiles[ctx.speaker];
  const board = profile?.boards[0] ?? "notes";
  if (existing) return { cards: [{ board, id: existing.id, label: "Note" }], deduped: true, say: "Already filed.", spoken: "Already filed." };
  const note = {
    id: uid("note"),
    at: ctx.now.toISOString(),
    author: ctx.speaker,
    board,
    dataClass: "OPERATIONAL" as const,
    lang: ctx.lang,
    text: ctx.body,
    filedKey: ctx.filedKey,
  };
  s.notes.unshift(note);
  return {
    cards: [{ board, id: note.id, label: "Note" }],
    deduped: false,
    say: `Filed once as a note on ${profile ? possessive(profile.name) : "the"} board. No other action matched.`,
    spoken: "Filed once as a note.",
  };
}

/* ------------------------------------------------------------ network */

function upsertNeed(
  s: DeskState,
  n: Pick<PublicNeed, "orgId" | "kind" | "text" | "area" | "date" | "entityKey">,
  ctx: ToolCtx,
): { need: PublicNeed | null; created: boolean } {
  const existing = s.needs.find((x) => x.entityKey === n.entityKey);
  if (existing) return { need: existing, created: false };
  const check = assertNetworkSafe({ dataClass: "PUBLIC_COMMUNITY", texts: [n.text] }, s);
  if (check.ok === false) {
    pushFeed(s, {
      at: ctx.now.toISOString(),
      speaker: "desk",
      text: `Kept off the network: ${check.reasons.join(", ")}.`,
      lang: "en",
      cards: [],
      via: "privacy check",
    });
    return { need: null, created: false };
  }
  const need: PublicNeed = { id: uid("need"), ...n, dataClass: "PUBLIC_COMMUNITY", createdAt: ctx.now.toISOString(), status: "open" };
  s.needs.unshift(need);
  return { need, created: true };
}

const COMPLEMENT: Partial<Record<PublicNeed["kind"], PublicNeed["kind"]>> = { "driver-run": "food-run", "food-run": "driver-run" };

/** The network agent: same day, same area, complementary runs → one pending dual-consent proposal. */
export function proposeMatches(s: DeskState, now: Date, today: string): NetworkMatch[] {
  const created: NetworkMatch[] = [];
  const open = s.needs.filter((n) => n.status === "open");
  for (const a of open) {
    for (const b of open) {
      if (a.orgId >= b.orgId || !COMPLEMENT[a.kind] || COMPLEMENT[a.kind] !== b.kind || a.date !== b.date || slug(a.area) !== slug(b.area)) continue;
      if (s.matches.some((m) => m.needIds.includes(a.id) && m.needIds.includes(b.id))) continue;
      const driver = a.kind === "driver-run" ? a : b;
      const food = a.kind === "food-run" ? a : b;
      const colony = s.colonies.find((c) => food.entityKey.includes(`|${c.id}|`));
      const when = dayWord(a.date, today);
      const publicText = `Same day, same area: ${possessive(orgName(s, driver.orgId))} volunteer driver run and ${possessive(
        orgName(s, food.orgId),
      )} ${colony?.name ?? "colony"} food run are both in ${a.area} ${when}. One trip can cover both stops.`;
      const check = assertNetworkSafe({ dataClass: "PUBLIC_COMMUNITY", texts: [publicText, a.text, b.text] }, s);
      if (check.ok === false) continue;
      const [newer, older] = a.createdAt >= b.createdAt ? [a, b] : [b, a];
      const proposal = createProposal({
        kind: "PROPOSE_COLLAB",
        fromProfileId: `org:${newer.orgId}`,
        toProfileId: `org:${older.orgId}`,
        fromAgentRef: `veridian:${newer.orgId}`,
        message: publicText,
      });
      const match: NetworkMatch = {
        id: proposal.id,
        proposal,
        needIds: [driver.id, food.id],
        orgs: [driver.orgId, food.orgId],
        consent: { tidepath: "pending", mangrove: "pending" },
        publicText,
        area: a.area,
        date: a.date,
        dataClass: "PUBLIC_COMMUNITY",
        createdAt: now.toISOString(),
        acceptedAt: null,
      };
      s.matches.unshift(match);
      created.push(match);
    }
  }
  return created;
}

export type ActionResult = { ok: true; say: string; cards: CardRef[] } | { ok: false; error: string; reasons?: string[] };

export function acceptMatch(s: DeskState, matchId: string, orgId: OrgId, now: Date): ActionResult {
  const match = s.matches.find((m) => m.id === matchId || m.proposal.id === matchId);
  if (!match) return { ok: false, error: "No such match." };
  if (!match.orgs.includes(orgId)) return { ok: false, error: `${orgId} is not a party to this match.` };
  const needs = s.needs.filter((n) => match.needIds.includes(n.id));
  const check = assertNetworkSafe({ dataClass: match.dataClass, texts: [match.publicText, ...needs.map((n) => n.text)] }, s);
  if (check.ok === false) return { ok: false, error: "Rejected: only PUBLIC_COMMUNITY may cross the network.", reasons: check.reasons };
  if (needs.some((n) => n.dataClass !== "PUBLIC_COMMUNITY")) return { ok: false, error: "Rejected: only PUBLIC_COMMUNITY may cross the network." };

  match.consent[orgId] = "accepted";
  const both = match.orgs.every((o) => match.consent[o] === "accepted");
  const cards: CardRef[] = [{ board: "network", id: match.id, label: `${orgName(s, orgId)} accepted` }];
  if (both && match.proposal.status === "pending") {
    // Same resolution path as the Agentscene social-scene protocol.
    match.proposal = resolveProposal({ ...emptySocialStore(), matches: [match.proposal] }, match.proposal.id, "accepted").matches[0];
    match.acceptedAt = now.toISOString();
    for (const n of needs) n.status = "matched";
    const food = needs.find((n) => n.kind === "food-run");
    const driver = needs.find((n) => n.kind === "driver-run");
    const colony = food ? s.colonies.find((c) => food.entityKey.includes(`|${c.id}|`)) : undefined;
    if (colony && driver) {
      colony.matchedWith = `${possessive(orgName(s, driver.orgId))} run — accepted by both orgs`;
      cards.push({ board: "colony", id: colony.id, label: `${colony.name}: food run matched` });
    }
    const shift = s.shifts.find((x) => x.orgId === driver?.orgId && x.date === match.date && slug(x.area) === slug(match.area));
    if (shift && colony) {
      shift.sharedWith = `${orgName(s, colony.orgId)} — ${colony.name} food stop. The driver confirms before it is added.`;
      cards.push({ board: "staffing", id: shift.id, label: "Shared run agreed" });
    }
    pushFeed(s, {
      at: now.toISOString(),
      speaker: "desk",
      text: `Both accepted: ${match.publicText}`,
      lang: "en",
      cards,
      via: "dual consent",
    });
    return { ok: true, say: `Accepted by ${orgName(s, match.orgs[0])} and ${orgName(s, match.orgs[1])}. Both boards updated.`, cards };
  }
  const waiting = match.orgs.filter((o) => match.consent[o] !== "accepted").map((o) => orgName(s, o));
  return { ok: true, say: `${orgName(s, orgId)} accepted. Waiting for ${waiting.join(" and ")}.`, cards };
}

export function respondToShift(s: DeskState, recruitId: string, decision: "accept" | "decline", now: Date): ActionResult {
  const r = s.recruits.find((x) => x.id === recruitId);
  if (!r) return { ok: false, error: "No such offer." };
  const shift = s.shifts.find((x) => x.id === r.shiftId);
  if (!shift) return { ok: false, error: "That shift no longer exists." };
  const person = s.profiles[r.personId];
  if (r.status !== "pending") return { ok: true, say: `Already ${r.status}.`, cards: [] };
  const cards: CardRef[] = [
    { board: "person", id: r.id, label: `${person?.name}: ${decision === "accept" ? "accepted" : "declined"}` },
    { board: "recruiting", id: r.id, label: "Recruit answered" },
  ];
  if (decision === "accept") {
    if (shift.status === "filled" && shift.filledBy !== r.personId) return { ok: false, error: "Someone already took this shift. Thank you." };
    r.status = "accepted";
    r.respondedAt = now.toISOString();
    shift.status = "filled";
    shift.filledBy = r.personId;
    clearUrgent(s, shift.id);
    cards.push({ board: "staffing", id: shift.id, label: "Shift filled" });
    pushFeed(s, {
      at: now.toISOString(),
      speaker: r.personId,
      text: `${person?.fullName} accepted the ${shift.role} shift — ${shift.area}, ${shift.date}. Staffing card: filled.`,
      lang: "en",
      cards,
      via: "B2C accept",
    });
    return { ok: true, say: `${person?.fullName} has the shift. Tidepath's staffing card shows filled.`, cards };
  }
  r.status = "declined";
  r.respondedAt = now.toISOString();
  pushFeed(s, {
    at: now.toISOString(),
    speaker: r.personId,
    text: `${person?.fullName} declined the ${shift.role} shift. No penalty — the shift stays open.`,
    lang: "en",
    cards,
    via: "B2C decline",
  });
  return { ok: true, say: "Declined. No problem — nothing changes on your desk, and the shift stays open.", cards };
}

export function rememberPreference(s: DeskState, profileId: ProfileId, key: string, value: unknown, now: Date): ActionResult {
  const p = s.profiles[profileId];
  if (!p) return { ok: false, error: "No such profile." };
  if (key !== "callListGrouping") return { ok: false, error: "Only callListGrouping is learnable in this demo." };
  if (value === "school") p.preferences.callListGrouping = "school";
  else delete p.preferences.callListGrouping;
  pushFeed(s, {
    at: now.toISOString(),
    speaker: "desk",
    text: value === "school" ? `Veridian remembered: ${p.name} groups her call list by school.` : `Veridian forgot ${p.name}'s call list grouping.`,
    lang: "en",
    cards: [{ board: "calls", id: "pref", label: "Preference" }],
    via: "rememberPreference",
  });
  return { ok: true, say: value === "school" ? "Veridian remembered." : "Veridian forgot that preference.", cards: [] };
}

export function checkSentence(s: DeskState, text: string, grantId = "grant-county") {
  const grant = s.grants.find((g) => g.id === grantId) ?? s.grants[0];
  const check = enforceLedger(text.slice(0, 600), s.ledger);
  return { ...check, ruleWarning: grant ? checkFunderRule(text, grant) : null };
}

/* -------------------------------------------------------------- registry */

export const TOOLS: Record<ToolName, (s: DeskState, args: Record<string, unknown>, ctx: ToolCtx) => ToolResult> = {
  fileCaseNote: (s, a, c) => fileCaseNote(s, a as unknown as CaseNoteArgs, c),
  reviewDonors: (s, a, c) => reviewDonors(s, a as unknown as DonorArgs, c),
  createWorkshopRequest: (s, a, c) => createWorkshopRequest(s, a as unknown as WorkshopArgs, c),
  fileClinicalNote: (s, a, c) => fileClinicalNote(s, a as unknown as ClinicalArgs, c),
  logHours: (s, a, c) => logHours(s, a as unknown as HoursArgs, c),
  openShift: (s, a, c) => openShift(s, a as unknown as ShiftArgs, c),
  draftGrantUpdate: (s, a, c) => draftGrantUpdate(s, a as unknown as GrantArgs, c),
  updateColony: (s, a, c) => updateColony(s, a as unknown as ColonyArgs, c),
  filePersonalNote: (s, a, c) => filePersonalNote(s, a as unknown as PersonalArgs, c),
  fileGeneralNote: (s, a, c) => fileGeneralNote(s, a, c),
};

export function runPlan(s: DeskState, plan: ToolCall[], ctx: ToolCtx): ToolResult[] {
  return plan.map((call) => TOOLS[call.tool](s, call.args, ctx));
}
