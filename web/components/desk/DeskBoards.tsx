"use client";

import { useState } from "react";
import { fmtUSD, REMOVED } from "@/lib/desk/ledger";
import { fmtDate, fmtDay, fmtTime } from "@/lib/desk/time";
import type { DeskPayload } from "@/lib/desk/payload";
import type { FunderView } from "@/lib/desk/privacy";
import type { BoardId, DataClass, DeskState, Donor, Lang, OrgId, ProfileId } from "@/lib/desk/types";
import css from "./DeskConsole.module.css";

export type SentenceCheck = {
  text: string;
  removed: string[];
  figures: { raw: string; ledgerId: string }[];
  ruleWarning: string | null;
};

export type BoardCtx = {
  data: DeskPayload;
  active: ProfileId;
  hot: Set<string>;
  hotBoards: Set<string>;
  funder: FunderView | null;
  funderOn: boolean;
  setFunderOn: (v: boolean) => void;
  busy: string | null;
  act: {
    acceptMatch: (matchId: string, orgId: OrgId) => void;
    respondShift: (recruitId: string, decision: "accept" | "decline") => void;
    setGrouping: (value: "school" | null) => void;
    checkSentence: (text: string) => Promise<SentenceCheck | null>;
  };
};

export const BOARD_META: Record<BoardId, { title: string; owner: string }> = {
  calls: { title: "Calls this week", owner: "Marisol · program" },
  donors: { title: "Donors", owner: "Denise · fundraising" },
  workshops: { title: "Workshops", owner: "Yesenia · front desk" },
  notes: { title: "Counseling notes", owner: "Reginald · counseling" },
  staffing: { title: "Staffing", owner: "Owen · volunteers" },
  recruiting: { title: "Recruiting", owner: "Owen · volunteers" },
  grants: { title: "Grants", owner: "Claudette · director" },
  colony: { title: "Colonies", owner: "Beatriz · Mangrove Mews" },
  network: { title: "Network", owner: "shared with partners · public needs only" },
  person: { title: "Personal desk", owner: "just for you" },
};

const LANG: Record<Lang, string> = { en: "English", es: "Español", ht: "Kreyòl" };

function ClassTag({ c }: { c: DataClass }) {
  const cls =
    c === "PUBLIC_COMMUNITY" ? css.tagPublic : c === "DONOR" ? css.tagDonor : c === "CLINICAL" ? css.tagClinical : css.tagOperational;
  return <span className={`${css.tag} ${cls}`}>{c}</span>;
}

function LangTag({ lang }: { lang: Lang }) {
  return <span className={`${css.tag} ${css.tagLang}`}>{LANG[lang]}</span>;
}

function lastGift(d: Donor): string | null {
  return d.gifts.length ? [...d.gifts].sort((x, y) => (x.date < y.date ? 1 : -1))[0].date : null;
}

function daysSince(iso: string, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / 86_400_000);
}

function whenWord(date: string, today: string): string {
  return date === today ? "today" : fmtDay(date);
}

function name(state: DeskState, id: ProfileId | null | undefined): string {
  return id ? state.profiles[id]?.fullName ?? id : "—";
}

/* ------------------------------------------------------------- boards */

function Calls({ ctx, compact }: { ctx: BoardCtx; compact: boolean }) {
  const { state } = ctx.data;
  const grouping = state.profiles.marisol.preferences.callListGrouping;
  const calls = state.calls.filter((c) => c.status === "open").sort((a, b) => (a.dueBy < b.dueBy ? -1 : 1));
  const groups = grouping === "school" ? [...new Set(calls.map((c) => c.school))].map((s) => ({ school: s, items: calls.filter((c) => c.school === s) })) : [{ school: "", items: calls }];
  const program = ["q3-mentoring-sessions", "q3-workshops", "q4-missed-session-followups"].map((id) => state.ledger[id]).filter(Boolean);
  const caseNotes = state.notes.filter((n) => n.board === "calls");
  return (
    <>
      {!compact && (
        <div className={css.row}>
          {grouping === "school" ? (
            <>
              <span className={`${css.tag} ${css.tagOk}`}>Grouped by school · Veridian remembered</span>
              <button type="button" className={`${css.btn} ${css.btnGhost} ${css.btnSmall}`} onClick={() => ctx.act.setGrouping(null)}>
                Undo
              </button>
            </>
          ) : (
            <button type="button" className={`${css.btn} ${css.btnSmall}`} onClick={() => ctx.act.setGrouping("school")}>
              Group call list by school
            </button>
          )}
        </div>
      )}
      {groups.map((g) => (
        <div key={g.school || "all"}>
          {g.school && <p className={css.groupLabel}>{g.school}</p>}
          <ul className={css.list}>
            {g.items.slice(0, compact ? 2 : 20).map((c) => (
              <li key={c.id} className={`${css.item} ${ctx.hot.has(c.id) ? css.hot : ""}`}>
                <div className={css.itemTop}>
                  <span className={css.itemTitle}>Call {c.who}</span>
                  {c.lang && <LangTag lang={c.lang} />}
                  <span className={css.tag}>due {fmtDay(c.dueBy)}</span>
                </div>
                <span className={css.itemSub}>
                  {c.reason}
                  {c.about && !c.who.startsWith(c.about) ? ` · ${c.about}` : ""}
                  {!grouping ? ` · ${c.school}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {!compact && (
        <>
          <div>
            <p className={css.label}>Families</p>
            <ul className={css.list}>
              {state.families.map((f) => (
                <li key={f.id} className={css.item}>
                  <div className={css.itemTop}>
                    <span className={css.itemTitle}>{f.name}</span>
                    <LangTag lang={f.lang} />
                  </div>
                  <span className={css.itemSub}>{f.summary}</span>
                  {f.lang === "ht" && !ctx.data.voiceReady.creoleLive && <span className={css.muted}>Creole notes are entered by staff.</span>}
                </li>
              ))}
            </ul>
          </div>
          {caseNotes.length > 0 && (
            <div>
              <p className={css.label}>Case notes · filed once</p>
              <ul className={css.list}>
                {caseNotes.slice(0, 4).map((n) => (
                  <li key={n.id} className={`${css.item} ${ctx.hot.has(n.id) ? css.hot : ""}`}>
                    <div className={css.itemTop}>
                      <ClassTag c={n.dataClass} />
                      <span className={css.muted}>
                        {name(state, n.author)} · {fmtTime(n.at)}
                      </span>
                    </div>
                    <span className={css.itemSub}>{n.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className={ctx.hot.has("ledger:q4-missed-session-followups") ? css.hot : ""}>
            <p className={css.label}>Quarterly report · from the facts log</p>
            <table className={css.ledger}>
              <tbody>
                {program.map((e) => (
                  <tr key={e.id}>
                    <td>{e.id}</td>
                    <td>{e.label}</td>
                    <td>{e.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {compact && <p className={css.muted}>{calls.length} open calls · follow-ups this quarter: {state.ledger["q4-missed-session-followups"]?.value ?? 0}</p>}
    </>
  );
}

function Donors({ ctx, compact }: { ctx: BoardCtx; compact: boolean }) {
  const { state, today, giveMiamiDay } = ctx.data;
  const lapsed = state.donors.filter((d) => {
    const last = lastGift(d);
    return !last || daysSince(last, today) >= 180;
  });
  return (
    <>
      <div className={css.banner}>
        {giveMiamiDay.label}. Call lapsed donors before then.
      </div>
      <div>
        <p className={css.label}>Call before Give Miami Day</p>
        <ul className={css.list}>
          {lapsed.map((d) => {
            const last = lastGift(d);
            return (
              <li key={d.id} className={`${css.item} ${ctx.hot.has(`lapse:${d.id}`) || ctx.hot.has(d.id) ? css.hot : ""}`}>
                <div className={css.itemTop}>
                  <span className={css.itemTitle}>{d.name}</span>
                  {d.mergedFrom?.length ? <span className={`${css.tag} ${css.tagOk}`}>merged · on the list once</span> : null}
                  {d.flaggedBy && <span className={`${css.tag} ${css.tagWarn}`}>flagged by {state.profiles[d.flaggedBy]?.name}</span>}
                </div>
                <span className={css.itemSub}>No gift since {last ? fmtDate(last) : "—"}</span>
              </li>
            );
          })}
        </ul>
      </div>
      {!compact && (
        <div>
          <p className={css.label}>Donor list · {state.donors.length} records</p>
          <ul className={css.list}>
            {state.donors.map((d) => {
              const last = lastGift(d);
              const total = d.gifts.reduce((a, g) => a + g.amount, 0);
              return (
                <li key={d.id} className={`${css.item} ${ctx.hot.has(d.id) ? css.hot : ""}`}>
                  <div className={css.itemTop}>
                    <span className={css.itemTitle}>{d.name}</span>
                    <ClassTag c="DONOR" />
                    <span className={css.muted}>{d.source}</span>
                  </div>
                  <span className={css.itemSub}>
                    {d.email} · {d.gifts.length} gift{d.gifts.length === 1 ? "" : "s"}, {fmtUSD(total)} · last {last ? fmtDate(last) : "—"}
                  </span>
                  {d.mergedFrom?.length ? <span className={css.muted}>Merged from: {d.mergedFrom.join(", ")} — shared gifts counted once.</span> : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {compact && <p className={css.muted}>{state.donors.length} donor records · {lapsed.length} to call</p>}
    </>
  );
}

function Workshops({ ctx, compact }: { ctx: BoardCtx; compact: boolean }) {
  const { state } = ctx.data;
  if (!state.workshops.length) return <p className={css.muted}>No workshop requests yet. Say one — the card, checklist and owners build themselves.</p>;
  return (
    <ul className={css.list}>
      {state.workshops.slice(0, compact ? 1 : 10).map((w) => (
        <li key={w.id} className={`${css.item} ${ctx.hot.has(w.id) ? css.hot : ""}`}>
          <div className={css.itemTop}>
            <span className={css.itemTitle}>
              {w.school} · {w.topic} workshop
            </span>
            <LangTag lang={w.lang} />
            <span className={css.tag}>{fmtDay(w.date)}</span>
            <span className={`${css.tag} ${css.tagWarn}`}>{w.status}</span>
          </div>
          {!compact && (
            <ul className={css.checklist}>
              {w.checklist.map((c) => (
                <li key={c.id}>
                  <span className={c.done ? css.checkDone : css.owner}>{c.done ? "✓" : "○"}</span>
                  <span>
                    {c.label} <span className={css.owner}>— {c.owner}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

function Notes({ ctx, compact }: { ctx: BoardCtx; compact: boolean }) {
  const { state } = ctx.data;
  const clinical = state.notes.filter((n) => n.dataClass === "CLINICAL");
  const counselor = ctx.active === "reginald";
  return (
    <>
      {!compact && (
        <div className={css.row}>
          <div className={css.toggle} role="group" aria-label="note view">
            <button type="button" className={!ctx.funderOn ? css.toggleOn : ""} onClick={() => ctx.setFunderOn(false)}>
              Staff view
            </button>
            <button type="button" className={ctx.funderOn ? css.toggleOn : ""} onClick={() => ctx.setFunderOn(true)}>
              Funder view
            </button>
          </div>
          <span className={css.muted}>{ctx.funderOn ? "Redacted on the server — the funder never receives the note." : "Stored once under CLINICAL."}</span>
        </div>
      )}
      {!clinical.length && <p className={css.muted}>No counseling notes yet.</p>}
      {ctx.funderOn && !compact ? (
        <ul className={css.list}>
          {(ctx.funder?.notes ?? []).map((n) => (
            <li key={n.id} className={`${css.item} ${ctx.hot.has(`funder:${n.id}`) ? css.hot : ""}`}>
              <span className={css.itemTitle}>{n.text}</span>
              {n.ledgerId && <span className={css.itemSub}>ledger <span className={css.cite}>{n.ledgerId}</span></span>}
            </li>
          ))}
        </ul>
      ) : (
        <ul className={css.list}>
          {clinical.slice(0, compact ? 1 : 10).map((n) => (
            <li key={n.id} className={`${css.item} ${ctx.hot.has(n.id) ? css.hot : ""}`}>
              <div className={css.itemTop}>
                <ClassTag c="CLINICAL" />
                <span className={css.muted}>
                  {name(state, n.author)} · {fmtTime(n.at)}
                </span>
              </div>
              <span className={css.itemSub}>{counselor && !compact ? n.text : "Visible to counseling staff only."}</span>
              <span className={css.muted}>Funder sees: “{n.funderView?.text}” · {n.funderView?.ledgerId}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Staffing({ ctx, compact }: { ctx: BoardCtx; compact: boolean }) {
  const { state, today } = ctx.data;
  return (
    <>
      {!state.shifts.length && <p className={css.muted}>No open shifts. Say one — “We need a driver in West Little River today.”</p>}
      <ul className={css.list}>
        {state.shifts.slice(0, compact ? 1 : 10).map((s) => (
          <li key={s.id} className={`${css.item} ${ctx.hot.has(s.id) ? css.hot : ""}`}>
            <div className={css.itemTop}>
              <span className={css.itemTitle}>
                {s.role[0].toUpperCase() + s.role.slice(1)} · {s.area} · {whenWord(s.date, today)}
              </span>
              {s.status === "filled" ? (
                <span className={`${css.tag} ${css.tagOk}`}>filled · {name(state, s.filledBy)}</span>
              ) : (
                <span className={`${css.tag} ${css.tagWarn}`}>open</span>
              )}
              {s.urgent && s.status === "open" && <span className={`${css.tag} ${css.tagUrgent}`}>urgent · routed to Owen</span>}
            </div>
            <span className={css.itemSub}>
              {s.time} · language: {s.lang} · posted {fmtTime(s.createdAt)} by {state.profiles[s.createdBy]?.name}
            </span>
            {s.sharedWith && <span className={css.muted}>Shared run: {s.sharedWith}</span>}
          </li>
        ))}
      </ul>
      {!compact && state.hours.length > 0 && (
        <div>
          <p className={css.label}>Volunteer hours · counted once</p>
          <ul className={css.list}>
            {state.hours.map((h) => (
              <li key={h.id} className={`${css.item} ${ctx.hot.has(h.id) ? css.hot : ""}`}>
                <span className={css.itemSub}>
                  <strong>{name(state, h.personId)}</strong> · {h.hours} h · {fmtDay(h.date)} · logged by {state.profiles[h.loggedBy]?.name}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function Recruiting({ ctx, compact }: { ctx: BoardCtx; compact: boolean }) {
  const { state } = ctx.data;
  return (
    <>
      <ul className={css.list}>
        {state.recruits.slice(0, compact ? 1 : 10).map((r) => {
          const shift = state.shifts.find((s) => s.id === r.shiftId);
          return (
            <li key={r.id} className={`${css.item} ${ctx.hot.has(r.id) ? css.hot : ""}`}>
              <div className={css.itemTop}>
                <span className={css.itemTitle}>Asked {name(state, r.personId)}</span>
                <span className={`${css.tag} ${r.status === "accepted" ? css.tagOk : r.status === "declined" ? "" : css.tagWarn}`}>{r.status}</span>
                <span className={css.tag}>Personal</span>
              </div>
              <span className={css.itemSub}>
                {shift ? `${shift.role} · ${shift.area}` : "shift"} — why: “{r.reason}”
              </span>
            </li>
          );
        })}
      </ul>
      {!state.recruits.length && <p className={css.muted}>No one asked yet. Veridian only asks people who already offered.</p>}
      {!compact && (
        <div>
          <p className={css.label}>Standing roles · open until the right person accepts</p>
          <ul className={css.list}>
            {state.standingRoles.map((r) => (
              <li key={r.id} className={css.item}>
                <span className={css.itemSub}>
                  <strong>{r.title}</strong> · {r.area} · {r.lang} · {r.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function Grants({ ctx, compact }: { ctx: BoardCtx; compact: boolean }) {
  const { state } = ctx.data;
  const draft = state.drafts[0];
  const grant = state.grants[0];
  const [text, setText] = useState("We spent $90,000 on food for 1,200 kids.");
  const [check, setCheck] = useState<SentenceCheck | null>(null);
  const cites = (ids: string[]) =>
    ids.map((id) => (
      <span key={id} className={css.cite} title={`${state.ledger[id]?.label}: ${state.ledger[id]?.unit === "usd" ? fmtUSD(state.ledger[id]?.value ?? 0) : state.ledger[id]?.value}`}>
        {id}
      </span>
    ));
  return (
    <>
      <div className={css.row}>
        <span className={css.tag}>{grant.name}</span>
        <span className={`${css.tag} ${css.tagWarn}`}>Rule: {grant.rule}</span>
      </div>
      {!draft ? (
        <p className={css.muted}>No draft yet. Ask for one — the desk writes only what the ledger holds.</p>
      ) : (
        <div className={`${css.item} ${ctx.hot.has(draft.id) ? css.hot : ""}`}>
          <span className={css.itemTitle}>{draft.title}</span>
          {(compact ? draft.paragraphs.slice(1, 2) : draft.paragraphs).map((p, i) => (
            <p key={i} className={css.para}>
              {p.text.split(REMOVED).map((part, j, arr) => (
                <span key={j}>
                  {part}
                  {j < arr.length - 1 && <span className={css.removed}>removed — not in the ledger</span>}
                </span>
              ))}
              {cites(p.cites)}
            </p>
          ))}
          {!compact && (
            <span className={css.muted}>
              Figures: {draft.figures.map((f) => `${f.raw} → ${f.ledgerId}`).join(" · ")}
              {draft.removed.length ? ` · removed: ${draft.removed.join(", ")}` : " · nothing removed"}
            </span>
          )}
        </div>
      )}
      {!compact && (
        <>
          <div>
            <p className={css.label}>Try to add a number</p>
            <div className={css.row}>
              <input className={css.input} value={text} onChange={(e) => setText(e.target.value)} aria-label="sentence to check against the ledger" />
              <button
                type="button"
                className={`${css.btn} ${css.btnSmall}`}
                onClick={async () => setCheck(await ctx.act.checkSentence(text))}
              >
                Check against the ledger
              </button>
            </div>
            {check && (
              <div className={css.item}>
                <p className={css.para}>
                  {check.text.split(REMOVED).map((part, j, arr) => (
                    <span key={j}>
                      {part}
                      {j < arr.length - 1 && <span className={css.removed}>removed — not in the ledger</span>}
                    </span>
                  ))}
                </p>
                <span className={css.muted}>
                  {check.removed.length ? `Removed: ${check.removed.join(", ")}.` : "Every figure is in the ledger."}{" "}
                  {check.figures.length ? `Kept: ${check.figures.map((f) => `${f.raw} → ${f.ledgerId}`).join(", ")}.` : ""}
                </span>
                {check.ruleWarning && <span className={`${css.tag} ${css.tagWarn}`}>{check.ruleWarning}</span>}
              </div>
            )}
          </div>
          <div>
            <p className={css.label}>Facts log</p>
            <table className={css.ledger}>
              <tbody>
                {Object.values(state.ledger).map((e) => (
                  <tr key={e.id}>
                    <td>{e.id}</td>
                    <td>{e.label}</td>
                    <td>{e.unit === "usd" ? fmtUSD(e.value) : e.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function Colonies({ ctx, compact }: { ctx: BoardCtx; compact: boolean }) {
  const { state } = ctx.data;
  return (
    <ul className={css.list}>
      {state.colonies.slice(0, compact ? 2 : 10).map((c) => (
        <li key={c.id} className={`${css.item} ${ctx.hot.has(c.id) ? css.hot : ""}`}>
          <div className={css.itemTop}>
            <span className={css.itemTitle}>{c.name}</span>
            <span className={`${css.tag} ${c.need ? css.tagWarn : c.status === "Unknown" ? "" : css.tagOk}`}>{c.status}</span>
            <ClassTag c={c.dataClass} />
          </div>
          <span className={css.itemSub}>
            {c.area} · {c.updatedAt ? `updated ${fmtTime(c.updatedAt)} by ${state.profiles[c.updatedBy ?? "beatriz"]?.name}` : "no update yet"}
          </span>
          {c.matchedWith && <span className={`${css.tag} ${css.tagOk}`}>Food run: {c.matchedWith}</span>}
        </li>
      ))}
    </ul>
  );
}

function Network({ ctx, compact }: { ctx: BoardCtx; compact: boolean }) {
  const { state } = ctx.data;
  const org = (id: OrgId) => state.orgs[id]?.name ?? id;
  return (
    <>
      {state.matches.length === 0 && <p className={css.muted}>No match yet. Public same-day needs appear here; a match needs both orgs to accept.</p>}
      <ul className={css.list}>
        {state.matches.slice(0, compact ? 1 : 5).map((m) => {
          const done = m.proposal.status === "accepted";
          return (
            <li key={m.id} className={`${css.item} ${ctx.hot.has(m.id) ? css.hot : ""}`}>
              <div className={css.itemTop}>
                <span className={css.itemTitle}>{done ? "Accepted by both" : "Match proposed · pending"}</span>
                <ClassTag c={m.dataClass} />
                <span className={css.tag}>{m.proposal.kind}</span>
              </div>
              <span className={css.itemSub}>{m.publicText}</span>
              <div className={css.row}>
                {m.orgs.map((o) =>
                  m.consent[o] === "accepted" ? (
                    <span key={o} className={`${css.tag} ${css.tagOk}`}>
                      {org(o)} ✓
                    </span>
                  ) : (
                    <button
                      key={o}
                      type="button"
                      className={`${css.btn} ${css.btnSmall} ${css.btnOk}`}
                      disabled={ctx.busy === `match:${m.id}:${o}`}
                      onClick={() => ctx.act.acceptMatch(m.id, o)}
                    >
                      Accept for {org(o)}
                    </button>
                  ),
                )}
              </div>
              {!compact && <span className={css.muted}>Privacy check passed: public class only — no child names, counseling detail, amounts or addresses.</span>}
            </li>
          );
        })}
      </ul>
      {!compact && state.needs.length > 0 && (
        <div>
          <p className={css.label}>Public needs on the network</p>
          <ul className={css.list}>
            {state.needs.map((n) => (
              <li key={n.id} className={`${css.item} ${ctx.hot.has(n.id) ? css.hot : ""}`}>
                <div className={css.itemTop}>
                  <ClassTag c={n.dataClass} />
                  <span className={css.tag}>{n.status}</span>
                </div>
                <span className={css.itemSub}>{n.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function Person({ ctx, compact, personId }: { ctx: BoardCtx; compact: boolean; personId: ProfileId }) {
  const { state, today } = ctx.data;
  const p = state.profiles[personId];
  const offers = state.recruits.filter((r) => r.personId === personId);
  const notes = state.notes.filter((n) => n.board === "person" && (n.subject === personId || n.author === personId));
  const hours = state.hours.filter((h) => h.personId === personId);
  const orgs = [...new Set(offers.map((o) => state.orgs[o.orgId]?.name))];
  return (
    <>
      {p.offer && (
        <p className={css.muted}>
          Offered: {p.offer.roles.join(", ")} · {p.offer.areas.join(", ")} · {p.offer.availability.join(", ")} · {p.offer.languages.map((l) => LANG[l]).join(", ")}
        </p>
      )}
      {offers.map((r) => {
        const s = state.shifts.find((x) => x.id === r.shiftId);
        if (!s) return null;
        return (
          <div key={r.id} className={`${css.item} ${ctx.hot.has(r.id) ? css.hot : ""}`}>
            <div className={css.itemTop}>
              <span className={css.itemTitle}>
                {r.status === "accepted" ? "Your shift" : r.status === "declined" ? "Declined — no problem" : "You match this shift"}
              </span>
              <span className={css.tag}>{state.orgs[r.orgId]?.name}</span>
            </div>
            <span className={css.itemSub}>
              {s.role[0].toUpperCase() + s.role.slice(1)} · {s.area} · {whenWord(s.date, today)}
            </span>
            <span className={css.muted}>Why you were asked: {r.reason}</span>
            {r.status === "pending" && (
              <div className={css.row}>
                <button type="button" className={`${css.btn} ${css.btnPrimary}`} disabled={ctx.busy === `shift:${r.id}`} onClick={() => ctx.act.respondShift(r.id, "accept")}>
                  Accept
                </button>
                <button type="button" className={`${css.btn} ${css.btnGhost}`} disabled={ctx.busy === `shift:${r.id}`} onClick={() => ctx.act.respondShift(r.id, "decline")}>
                  Decline
                </button>
              </div>
            )}
            {r.status === "declined" && <span className={css.muted}>Nothing changes on your desk. Tidepath keeps the shift open.</span>}
            {r.status === "accepted" && s.sharedWith && (
              <span className={css.muted}>Tidepath and Mangrove Mews agreed to share this run. Owen will ask you before adding a stop.</span>
            )}
          </div>
        );
      })}
      {!compact && (
        <>
          {orgs.length > 0 && <p className={css.muted}>Communities that want you: {orgs.join(", ")}</p>}
          {hours.length > 0 && (
            <div>
              <p className={css.label}>Your hours</p>
              <ul className={css.list}>
                {hours.map((h) => (
                  <li key={h.id} className={`${css.item} ${ctx.hot.has(h.id) ? css.hot : ""}`}>
                    <span className={css.itemSub}>
                      {h.hours} hours · {fmtDay(h.date)} · logged by {state.profiles[h.loggedBy]?.name}, Tidepath
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className={css.label}>Your notes</p>
            <ul className={css.list}>
              {notes.map((n) => (
                <li key={n.id} className={`${css.item} ${ctx.hot.has(n.id) ? css.hot : ""}`}>
                  <div className={css.itemTop}>
                    <LangTag lang={n.lang} />
                    <span className={css.muted}>{fmtTime(n.at)}</span>
                  </div>
                  <span className={css.itemSub}>{n.text}</span>
                </li>
              ))}
            </ul>
            {!notes.length && <p className={css.muted}>Nothing yet.</p>}
          </div>
        </>
      )}
      {compact && !offers.length && <p className={css.muted}>{hours.length ? `${hours.reduce((a, h) => a + h.hours, 0)} hours logged` : "No offers or hours yet."}</p>}
    </>
  );
}

export function Board({ id, ctx, compact = false, front = false, personId }: { id: BoardId; ctx: BoardCtx; compact?: boolean; front?: boolean; personId?: ProfileId }) {
  const meta = BOARD_META[id];
  const person = personId ? ctx.data.state.profiles[personId] : null;
  const hotKey = person ? `person:${person.id}` : id;
  return (
    <section
      className={`${css.board} ${front ? css.boardFront : ""} ${compact ? css.boardCompact : ""} ${ctx.hotBoards.has(hotKey) ? css.hot : ""}`}
      aria-label={person ? `${person.fullName}'s desk` : meta.title}
      data-board={id}
    >
      <div className={css.boardHead}>
        <h3 className={css.boardTitle}>{person ? `${person.fullName}'s desk` : meta.title}</h3>
        <span className={css.boardOwner}>{person ? "Personal desk" : meta.owner}</span>
      </div>
      {id === "calls" && <Calls ctx={ctx} compact={compact} />}
      {id === "donors" && <Donors ctx={ctx} compact={compact} />}
      {id === "workshops" && <Workshops ctx={ctx} compact={compact} />}
      {id === "notes" && <Notes ctx={ctx} compact={compact} />}
      {id === "staffing" && <Staffing ctx={ctx} compact={compact} />}
      {id === "recruiting" && <Recruiting ctx={ctx} compact={compact} />}
      {id === "grants" && <Grants ctx={ctx} compact={compact} />}
      {id === "colony" && <Colonies ctx={ctx} compact={compact} />}
      {id === "network" && <Network ctx={ctx} compact={compact} />}
      {id === "person" && personId && <Person ctx={ctx} compact={compact} personId={personId} />}
    </section>
  );
}
