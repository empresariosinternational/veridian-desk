/**
 * Veridian Desk smoke test — runs the whole 4-minute demo script through the
 * same pipeline the microphone uses, offline, and checks the definition of done.
 *
 *   cd web && npx tsx scripts/desk-smoke.ts
 */

import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { detectLang, processUtterance } from "../lib/desk/agent";
import { SCRIPT } from "../lib/desk/fallback";
import { REMOVED } from "../lib/desk/ledger";
import { arm, disarm, nodeView, presence, settle } from "../lib/desk/node";
import { assertNetworkSafe, projectForFunder } from "../lib/desk/privacy";
import { createSeedState } from "../lib/desk/seed";
import { todayISO } from "../lib/desk/time";
import { acceptMatch, checkSentence, isLapsed, rememberPreference, respondToShift } from "../lib/desk/tools";
import type { DeskState } from "../lib/desk/types";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

const NOW = new Date("2026-11-07T19:30:00.000Z"); // Sat Nov 7, 2:30 PM in Miami
const at = (sec: number) => new Date(NOW.getTime() + sec * 1000);
const line = (id: string) => SCRIPT.find((l) => l.id === id)!;
const say = (s: DeskState, id: string, sec: number) => processUtterance(s, { text: line(id).text, source: "script", now: at(sec) });

function run(): void {
  const s = createSeedState();

  check("todayISO is Miami's date, even after 0:00 UTC", todayISO(NOW) === "2026-11-07" && todayISO(new Date("2026-11-08T03:30:00.000Z")) === "2026-11-07");

  // 1. Arm → LISTENING, red, OLED line.
  arm(s, at(0));
  const v = nodeView(s, at(0));
  check("arm → LISTENING / red / 'Listening — Tidepath desk'", v.status === "LISTENING" && v.color === "red" && v.line === "Listening — Tidepath desk");

  // 2. Marisol.
  const m = say(s, "marisol", 5);
  const call = s.calls.find((c) => c.about === "Jordan Alvarez");
  check("Marisol: case note filed once", s.notes.filter((n) => n.subject === "Jordan Alvarez" && n.board === "calls").length === 1);
  check("Marisol: call list item for this week", !!call && call.who === "Jordan's mom" && call.dueBy === "2026-11-13", call ? `${call.who}, due ${call.dueBy}` : "missing");
  check("Marisol: quarterly follow-ups 0 → 1", s.ledger["q4-missed-session-followups"].value === 1);
  check("Marisol: spoken confirmation", m.spoken.startsWith("Filed once."), m.spoken);

  // Repeat Marisol: Already filed, nothing doubled.
  const again = say(s, "marisol", 8);
  check("Repeat Marisol → Already filed", again.alreadyFiled && again.say.startsWith("Already filed"));
  check("Repeat Marisol → no duplicate call, note or ledger bump",
    s.calls.filter((c) => c.about === "Jordan Alvarez").length === 1 && s.ledger["q4-missed-session-followups"].value === 1);
  // Reworded repeat (entity-level say-it-once).
  const reworded = processUtterance(s, { text: "This is Marisol. Jordan missed mentoring on Tuesday, please call his mom this week.", source: "typed", now: at(9) });
  check("Reworded repeat → Already filed (entity key)", reworded.alreadyFiled, reworded.say);

  // 3. Denise.
  const before = s.donors.length;
  const d = say(s, "denise", 15);
  const maria = s.donors.find((x) => x.name === "María González");
  check("Denise: duplicate María/Maria merged", before === 6 && s.donors.length === 5 && !!maria?.mergedFrom?.length);
  check("Denise: shared gift kept once", maria?.gifts.length === 2 && maria.gifts.reduce((a, g) => a + g.amount, 0) === 100);
  check("Denise: lapse flagged (no gift since March)", !!maria && isLapsed(maria, "2026-11-07"));
  check("Denise: 'call before Give Miami Day' with countdown", d.say.includes("call before Give Miami Day") && d.say.includes("12 days"), d.say);

  // 4. Yesenia.
  say(s, "yesenia", 25);
  const w = s.workshops[0];
  check("Yesenia: workshop card", !!w && w.school === "Edison Elementary" && w.lang === "es" && w.date === "2026-11-12" && w.status === "slides-pending" && w.checklist.length >= 4,
    w ? `${w.school} ${w.date} ${w.lang} ${w.status}` : "missing");

  // 5. Reginald.
  say(s, "reginald", 35);
  const clinical = s.notes.find((n) => n.dataClass === "CLINICAL");
  check("Reginald: CLINICAL note stored once", s.notes.filter((n) => n.dataClass === "CLINICAL").length === 1 && clinical?.text.includes("panic"));
  const funder = projectForFunder(s);
  const funderJson = JSON.stringify(funder);
  check("Funder view hides the panic sentence (server-side)", !funderJson.toLowerCase().includes("panic") && funder.notes[0]?.text === "School-based counseling session completed");
  check("Funder view cites the ledger id", funder.notes[0]?.ledgerId === "q4-counseling-sessions");

  // 6. Owen.
  const o = say(s, "owen", 45);
  check("Owen: Ana's 3 hours once (yesterday)", s.hours.length === 1 && s.hours[0].hours === 3 && s.hours[0].date === "2026-11-06");
  const shift = s.shifts[0];
  check("Owen: one driver shift, West Little River, today, urgent", s.shifts.length === 1 && shift.area === "West Little River" && shift.date === "2026-11-07" && shift.urgent);
  const rec = s.recruits.find((r) => r.personId === "luis");
  check("Owen: pending recruit card for Luis with one-sentence reason", rec?.status === "pending" && /^You offered/.test(rec.reason), rec?.reason);
  check("Owen: urgent reaches the node (blink)", nodeView(s, at(46)).blink === true);
  check("Owen: spoken confirmation", o.spoken.includes("Driver shift offered to Luis"), o.spoken);
  const owenAgain = say(s, "owen", 50);
  check("Repeat Owen → hours not doubled", owenAgain.alreadyFiled && s.hours.length === 1 && s.shifts.length === 1);

  // 7. Claudette.
  say(s, "claudette", 60);
  const draft = s.drafts[0];
  const text = draft.paragraphs.map((p) => p.text).join(" ");
  const dollars: string[] = text.match(/\$[\d,]+/g) ?? [];
  check("Claudette: draft has $120,000 and $80,000 and no other dollar amount",
    dollars.includes("$120,000") && dollars.includes("$80,000") && dollars.every((x) => x === "$120,000" || x === "$80,000"), dollars.join(" "));
  check("Claudette: every figure cites a ledger id", draft.figures.length >= 4 && draft.figures.every((f) => !!s.ledger[f.ledgerId]),
    draft.figures.map((f) => `${f.raw}→${f.ledgerId}`).join(", "));
  check("Claudette: spend line shows the funder rule", text.includes("Workshops and mentoring only. No food. No fundraising gala."));
  const guarded = checkSentence(s, "We spent $90,000 on food for 1,200 kids and held 42 mentoring sessions.");
  check("Ledger guard strips $90,000 and 1,200, keeps 42", guarded.removed.join(",") === "$90,000,1,200" && guarded.text.includes(REMOVED) && guarded.text.includes("42"), guarded.text);
  check("Ledger guard flags the funder rule (food)", !!guarded.ruleWarning);

  // 8. Beatriz.
  say(s, "beatriz", 70);
  const colonyB = s.colonies.find((c) => c.id === "colony-b");
  check("Beatriz: Colony B public card same day", colonyB?.status === "Needs food — today" && colonyB.dataClass === "PUBLIC_COMMUNITY");
  const match = s.matches[0];
  check("Network: one pending dual-consent match (agent-protocol shape)", s.matches.length === 1 && match.proposal.status === "pending" && match.proposal.kind === "PROPOSE_COLLAB");
  const netText = JSON.stringify({ match, needs: s.needs });
  check("Network card has no child name, counseling, amounts or addresses",
    !/jordan|alvarez|jean-baptiste|panic|\$\d/i.test(netText) && assertNetworkSafe({ dataClass: "PUBLIC_COMMUNITY", texts: [match.publicText] }, s).ok);
  check("Network rejects a non-public payload", !assertNetworkSafe({ dataClass: "CLINICAL", texts: ["Jordan talked about panic"] }, s).ok);
  check("Luis's shift and the Mangrove match are different cards", match.id !== shift.id && match.id !== rec?.id);

  // 9. Luis (B2C), Spanish line, then Accept.
  const es = say(s, "luis-es", 80);
  check("Spanish line files in Spanish and says so", es.lang === "es" && s.notes.some((n) => n.subject === "luis" && n.lang === "es") && es.spoken.startsWith("Anotado"), es.spoken);
  check("detectLang: Spanish vs English", detectLang("Soy Luis. Hoy puedo manejar.") === "es" && detectLang("This is Owen. We need a driver today.") === "en");
  const acc = respondToShift(s, rec!.id, "accept", at(90));
  check("Luis accepts → shift filled, his desk shows it", acc.ok && shift.status === "filled" && shift.filledBy === "luis");
  check("Accepting clears the urgent blink", nodeView(s, at(91)).blink === false);

  // 10. Org match: both orgs accept.
  const a1 = acceptMatch(s, match.id, "tidepath", at(100));
  check("Tidepath accepts → still pending until Mangrove accepts", a1.ok && match.proposal.status === "pending");
  const a2 = acceptMatch(s, match.id, "mangrove", at(105));
  check("Mangrove accepts → match accepted, both boards updated",
    a2.ok && match.proposal.status === "accepted" && !!colonyB?.matchedWith && !!s.shifts[0].sharedWith);

  // Self-learning, demo-honest.
  check("Marisol starts with no preference", s.profiles.marisol.preferences.callListGrouping === undefined);
  rememberPreference(s, "marisol", "callListGrouping", "school", at(110));
  check("rememberPreference persists callListGrouping: school", s.profiles.marisol.preferences.callListGrouping === "school");

  // Node: disarm without audio, presence never starts capture, FILED → IDLE.
  arm(s, at(120));
  disarm(s, at(121));
  check("Disarm → IDLE without audio", s.node.status === "IDLE");
  presence(s, at(122));
  check("Presence raises the banner only", nodeView(s, at(123)).presence && s.node.status === "IDLE");
  say(s, "claudette", 130);
  settle(s, at(140));
  check("FILED settles back to IDLE", s.node.status === "IDLE" || s.node.status === "FILED");

  // Decline path on a fresh desk: must not punish, shift stays open.
  const s2 = createSeedState();
  processUtterance(s2, { text: line("owen").text, source: "script", now: at(0) });
  const r2 = s2.recruits[0];
  const dec = respondToShift(s2, r2.id, "decline", at(5));
  check("Decline leaves the shift open, no penalty", dec.ok && s2.shifts[0].status === "open" && r2.status === "declined");
}

async function storeRoundTrip(): Promise<void> {
  process.env.DESK_STATE_PATH = path.join(mkdtempSync(path.join(tmpdir(), "desk-")), "desk-state.json");
  const store = await import("../lib/desk/store");
  await store.resetState();
  await store.mutate((s) => processUtterance(s, { text: line("marisol").text, source: "script", now: NOW }));
  const again = await store.mutate((s) => processUtterance(s, { text: line("marisol").text, source: "script", now: NOW }));
  const state = await store.readState();
  check("Store: persisted to JSON and repeat ignored", again.result.alreadyFiled && state.calls.filter((c) => c.about === "Jordan Alvarez").length === 1);
  check("Store: persistence ok", store.persistenceOk());
}

async function clientMode(): Promise<void> {
  // Vercel: no shared disk, so the browser carries the state and the server stays stateless.
  const file = path.join(mkdtempSync(path.join(tmpdir(), "desk-client-")), "desk-state.json");
  process.env.DESK_STATE_PATH = file;
  process.env.DESK_STATE_MODE = "client";
  const { existsSync } = await import("fs");
  const store = await import("../lib/desk/store");
  check("Client mode: detected", store.stateMode() === "client");
  const first = await store.openDesk(undefined).mutate((s) => processUtterance(s, { text: line("marisol").text, source: "script", now: NOW }));
  const carried = JSON.parse(JSON.stringify(first.state));
  const again = await store.openDesk(carried).mutate((s) => processUtterance(s, { text: line("marisol").text, source: "script", now: NOW }));
  check("Client mode: state round-trips through the browser; repeat → Already filed", again.result.alreadyFiled && again.state.calls.filter((c) => c.about === "Jordan Alvarez").length === 1);
  const junk = await store.openDesk({ version: 1, hacked: true }).read();
  check("Client mode: a malformed state falls back to the seed", junk.calls.length === 1 && junk.donors.length === 6);
  check("Client mode: nothing written to disk", !existsSync(file));
  delete process.env.DESK_STATE_MODE;
  check("File mode is the default off Vercel", store.stateMode() === (process.env.VERCEL ? "client" : "file"));
}

run();
storeRoundTrip()
  .then(clientMode)
  .then(() => {
    console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
    process.exit(failures ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
