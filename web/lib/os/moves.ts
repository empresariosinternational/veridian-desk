/**
 * "Connect the dots": next moves Veridian proposes from the desk's own data
 * (open roles, people's offers, colonies, calls, donors, matches) and The Pond.
 * Pure and deterministic; runs in the browser on whatever copy of the desk the
 * person has. Every action stays inside the team: a task, a draft or a link.
 */
import type { DeskState, Donor, OrgId, Profile } from "@/lib/desk/types";
import { addDays, daysBetween, fmtDate, fmtDay, GIVE_MIAMI_DAY } from "@/lib/desk/time";
import type { Priority } from "@/lib/veridian/tasks";
import type { GoalId } from "./prefs";
import { categoryOf, POND_COMMUNITIES, sharesArea } from "./pond";

export type Stage = "discover" | "connect" | "track" | "meet" | "follow";

export const STAGES: { id: Stage; label: string; where: string; empty: string }[] = [
  { id: "discover", label: "discover", where: "the pond and the desk", empty: "Veridian keeps watching The Pond for this goal." },
  { id: "connect", label: "connect", where: "intros and invites", empty: "Nothing waiting on you here." },
  { id: "track", label: "track", where: "people · crm", empty: "People who say yes land here." },
  { id: "meet", label: "meet", where: "events", empty: "No dates on this goal yet." },
  { id: "follow", label: "follow up", where: "briefs and thank-yous", empty: "Follow-ups appear after people meet." },
];

export type MoveAction =
  | { kind: "task"; label: string; task: { title: string; priority: Priority; dueDate: string | null } }
  | { kind: "link"; label: string; href: string };

export type Move = {
  id: string;
  goal: GoalId;
  stage: Stage;
  /** The sections this move connects, in order ("the pond → people"). */
  path: string[];
  title: string;
  why: string;
  action: MoveAction;
  ask?: { label: string; prompt: string };
  note: string;
  /** Shown in goal spaces only, not in the moves list (for example an event date). */
  goalOnly?: boolean;
};

const article = (w: string) => (/^[aeiou]/i.test(w.trim()) ? "an" : "a");
const earlier = (a: string, b: string) => (a < b ? a : b);

function when(p: Profile): string {
  const a = p.offer?.availability ?? [];
  const parts = a.map((x) => (x === "evenings" ? "in the evenings" : `on ${x}`));
  return parts.length ? parts.join(" and ") : "when they can";
}

function langs(p: Profile): string {
  const names: Record<string, string> = { en: "English", es: "Spanish", ht: "Haitian Creole" };
  const l = (p.offer?.languages ?? []).map((x) => names[x] ?? x);
  return l.length > 1 ? `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}` : l[0] ?? "English";
}

function lastGift(d: Donor): string | null {
  const dates = (d.gifts ?? []).map((g) => g.date).sort();
  return dates.length ? dates[dates.length - 1] : null;
}

export function computeMoves(state: DeskState, today: string): Move[] {
  const moves: Move[] = [];
  const profiles = Object.values(state.profiles ?? {}) as Profile[];
  const people = profiles.filter((p) => p.side === "B2C" && p.offer);
  const orgName = (id: OrgId) => state.orgs?.[id]?.name ?? id;
  const gmdDays = daysBetween(today, GIVE_MIAMI_DAY);
  const gmdAhead = gmdDays >= 0;

  // Open roles meet the people who already offered that kind of help nearby.
  for (const role of state.standingRoles ?? []) {
    if (role.status !== "open") continue;
    const cat = categoryOf(role.title);
    const fit = people.find(
      (p) => (p.offer?.roles ?? []).some((r) => categoryOf(r) === cat) && (p.offer?.areas ?? []).some((a) => sharesArea(a, role.area)),
    );
    const gmd = /give miami day/i.test(role.title) && gmdAhead;
    if (fit) {
      const first = fit.fullName.split(" ")[0];
      const offered = fit.offer?.roles[0] ?? "help";
      moves.push({
        id: `role:${role.id}:${fit.id}`,
        goal: "staffing",
        stage: "connect",
        path: gmd ? ["desk", "events"] : ["desk", "people"],
        title: gmd ? "Give Miami Day still needs event helpers." : `${role.title} is still open.`,
        why: `${fit.fullName} offered to help as ${article(offered)} ${offered} ${when(fit)} in ${(fit.offer?.areas ?? []).join(", ")}.${gmd ? ` Give Miami Day is ${fmtDay(GIVE_MIAMI_DAY)}.` : ""}`,
        action: {
          kind: "task",
          label: `Invite ${first}`,
          task: { title: `Invite ${fit.fullName} to help as ${role.title}`, priority: "high", dueDate: gmd ? earlier(addDays(today, 3), addDays(GIVE_MIAMI_DAY, -2)) : addDays(today, 3) },
        },
        ask: {
          label: "Draft the invite",
          prompt: `Draft a short, warm invite to ${fit.fullName} to help as ${role.title}. They offered to help ${when(fit)} in ${(fit.offer?.areas ?? []).join(", ")} and speak ${langs(fit)}. Keep it in our voice and don't send anything.`,
        },
        note: "Drafted, not sent",
      });
      continue;
    }
    // Nobody on the desk fits: look across The Pond.
    const mine = orgName(role.orgId);
    const c = POND_COMMUNITIES.find((x) => x.name !== mine && x.offers.some((o) => categoryOf(o) === cat));
    if (!c || !cat) continue;
    const offer = c.offers.find((o) => categoryOf(o) === cat) ?? c.offers[0];
    moves.push({
      id: `pond:${role.id}:${c.id}`,
      goal: "recruiting",
      stage: "discover",
      path: ["the pond", "desk"],
      title: `Your ${role.title} role is still open.`,
      why: `${c.name} lists ${offer} in ${c.area} on The Pond.`,
      action: { kind: "link", label: `See ${c.name}`, href: `/social-scene#${c.id}` },
      ask: {
        label: "Draft a hello",
        prompt: `Draft a short hello from ${mine} to ${c.name} on The Pond about our ${role.title} role. Share only our public community profile.`,
      },
      note: "Shares your public profile only",
    });
  }

  // A colony that needs checking meets a neighbor who drives there.
  for (const col of state.colonies ?? []) {
    if (!col.need && !/unknown/i.test(col.status)) continue;
    const driver = people.find(
      (p) => (p.offer?.roles ?? []).some((r) => categoryOf(r) === "driving") && (p.offer?.areas ?? []).some((a) => sharesArea(a, col.area) && !/miami-dade/i.test(a)),
    );
    if (!driver) continue;
    const first = driver.fullName.split(" ")[0];
    const org = orgName(col.orgId);
    moves.push({
      id: `colony:${col.id}:${driver.id}`,
      goal: "staffing",
      stage: "connect",
      path: ["the pond", "people"],
      title: `${driver.fullName} can drive ${when(driver)} in ${col.area}.`,
      why: col.need ? `${org} needs ${col.need} for ${col.name}.` : `${col.name}'s status is unknown. ${org} cares for it in ${col.area}.`,
      action: { kind: "task", label: `Ask ${first}`, task: { title: `Ask ${driver.fullName} about a run for ${col.name} (${org})`, priority: "normal", dueDate: addDays(today, 2) } },
      ask: {
        label: "Draft a message",
        prompt: `Draft a short message to ${driver.fullName}, in ${langs(driver)}, asking if they could do a run for ${org}'s ${col.name} in ${col.area} ${when(driver)}. Share no addresses.`,
      },
      note: "Both sides approve first",
    });
  }

  // Network matches the desk already proposed (dual consent, public text only).
  for (const m of state.matches ?? []) {
    if (m.acceptedAt) continue;
    moves.push({
      id: `match:${m.id}`,
      goal: "staffing",
      stage: "connect",
      path: ["the pond", "desk"],
      title: "Two communities can share one run.",
      why: m.publicText,
      action: { kind: "link", label: "Review on the desk", href: "/desk" },
      note: "Both communities approve first",
    });
  }

  for (const call of state.calls ?? []) {
    if (call.status !== "open") continue;
    moves.push({
      id: `call:${call.id}`,
      goal: /workshop/i.test(`${call.about} ${call.reason}`) ? "events" : "staffing",
      stage: "follow",
      path: ["desk", "people"],
      title: `Call the ${call.who} by ${fmtDay(call.dueBy)}.`,
      why: `${call.reason}. ${call.school}.`,
      action: { kind: "task", label: "Add to my calls", task: { title: `Call the ${call.who}: ${call.about}`, priority: "high", dueDate: call.dueBy } },
      ask: { label: "Prep the call", prompt: `Help me prep a short call to the ${call.who} about ${call.about.toLowerCase()}. Context: ${call.reason}. Give me three talking points.` },
      note: "From the desk call list",
    });
  }

  // Donors: same gift on two records, first gifts, and long-quiet donors.
  const byGift = new Map<string, Donor[]>();
  for (const d of state.donors ?? []) {
    for (const g of d.gifts ?? []) {
      const list = byGift.get(g.id) ?? [];
      if (!list.includes(d)) list.push(d);
      byGift.set(g.id, list);
    }
  }
  for (const [giftId, ds] of byGift) {
    if (ds.length < 2) continue;
    const g = ds[0].gifts.find((x) => x.id === giftId);
    moves.push({
      id: `dup:${giftId}`,
      goal: "fundraising",
      stage: "track",
      path: ["people"],
      title: "Two donor records look like the same person.",
      why: `${ds[0].name} and ${ds[1].name} share the same ${g ? fmtDate(g.date) : ""} gift.`,
      action: { kind: "link", label: "Review on the desk", href: "/desk" },
      note: "Nothing merges without you",
    });
  }
  for (const d of state.donors ?? []) {
    const last = lastGift(d);
    if (!last) continue;
    const age = daysBetween(last, today);
    if ((d.gifts ?? []).length === 1 && age >= 0 && age <= 30) {
      moves.push({
        id: `thanks:${d.id}`,
        goal: "fundraising",
        stage: "follow",
        path: ["people"],
        title: `Thank ${d.name} for their first gift.`,
        why: `It came in through the ${d.source.toLowerCase()} on ${fmtDate(last)}.`,
        action: { kind: "task", label: "Add the thank-you", task: { title: `Thank ${d.name} for their first gift`, priority: "normal", dueDate: addDays(today, 2) } },
        ask: { label: "Draft the thank-you", prompt: `Draft a short thank-you to ${d.name} for their first gift on ${fmtDate(last)}. Short sentences, no jargon, and don't mention the amount.` },
        note: "Sends after you approve",
      });
    } else if (age > 300) {
      moves.push({
        id: `lapsed:${d.id}`,
        goal: "fundraising",
        stage: "follow",
        path: ["people", "events"],
        title: `${d.name} hasn't given since ${fmtDate(last)}.`,
        why: gmdAhead ? `Give Miami Day is ${fmtDay(GIVE_MIAMI_DAY)}, a natural moment to reconnect.` : "A short hello keeps the door open.",
        action: { kind: "task", label: "Plan a hello", task: { title: `Reconnect with ${d.name}${gmdAhead ? " before Give Miami Day" : ""}`, priority: "normal", dueDate: gmdAhead ? addDays(GIVE_MIAMI_DAY, -3) : addDays(today, 7) } },
        ask: { label: "Draft a hello", prompt: `Draft a warm, short note to ${d.name}, who last gave on ${fmtDate(last)}${gmdAhead ? `, inviting them to Give Miami Day on ${fmtDay(GIVE_MIAMI_DAY)}` : ""}. No pressure, our voice.` },
        note: "Sends after you approve",
      });
    }
  }

  // People who said yes to a shift, for the "track" stage.
  for (const r of state.recruits ?? []) {
    if (r.status !== "accepted") continue;
    const shift = (state.shifts ?? []).find((s) => s.id === r.shiftId);
    const person = state.profiles?.[r.personId];
    if (!shift || !person) continue;
    moves.push({
      id: `yes:${r.id}`,
      goal: "staffing",
      stage: "track",
      path: ["desk", "people"],
      title: `${person.fullName} said yes.`,
      why: `${shift.role} · ${fmtDay(shift.date)} · ${shift.area}`,
      action: { kind: "link", label: "Open the desk", href: "/desk" },
      note: "Confirmed on the desk",
      goalOnly: true,
    });
  }

  if (gmdAhead) {
    for (const goal of ["events", "staffing", "fundraising"] as GoalId[]) {
      moves.push({
        id: `event:gmd:${goal}`,
        goal,
        stage: "meet",
        path: ["events"],
        title: "Give Miami Day",
        why: `${fmtDay(GIVE_MIAMI_DAY)} · ${gmdDays === 0 ? "today" : gmdDays === 1 ? "tomorrow" : `${gmdDays} days away`}`,
        action: { kind: "link", label: "Open events", href: "/events" },
        note: "On your calendar",
        goalOnly: true,
      });
    }
  }

  return moves;
}

const STAGE_ORDER: Stage[] = ["connect", "discover", "follow", "track", "meet"];

/** Moves for the person's goals first, in their order. */
export function rankMoves(moves: Move[], goals: GoalId[]): Move[] {
  const rank = (g: GoalId) => {
    const i = goals.indexOf(g);
    return i === -1 ? goals.length : i;
  };
  return [...moves].sort((a, b) => rank(a.goal) - rank(b.goal) || STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage));
}
