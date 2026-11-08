"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useVeridian } from "@/components/VeridianContext";
import { findRipples, initials, listingAsCommunity, POND_COMMUNITIES, useListing, type Community } from "@/lib/os/pond";
import { GOALS, usePrefs, type GoalId } from "@/lib/os/prefs";
import { IconLink, IconLock, IconSearch } from "./Icons";

/** The Pond: a marketplace where communities get promoted and Veridian finds the ripples between them. */
export default function PondMarketplace() {
  const { ask, addTasks } = useVeridian();
  const [prefs] = usePrefs();
  const [listing] = useListing();
  const [goal, setGoal] = useState<GoalId | "all">("all");
  const [query, setQuery] = useState("");
  const [proposed, setProposed] = useState<string[]>([]);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    setJoined(new URLSearchParams(window.location.search).get("joined") === "1");
  }, []);

  const mine = listing ? listingAsCommunity(listing) : null;
  const myName = mine?.name ?? "our community";
  const everyone = useMemo(() => [...(mine ? [mine] : []), ...POND_COMMUNITIES], [mine]);
  const ripples = useMemo(() => findRipples(everyone), [everyone]);
  const q = query.trim().toLowerCase();
  const shown = everyone.filter((c) => {
    if (goal !== "all" && !c.goals.includes(goal)) return false;
    if (!q) return true;
    return [c.name, c.kind, c.area, ...c.offers, ...c.needs].some((s) => s.toLowerCase().includes(q));
  });
  const goalOrder = [...prefs.goals, ...GOALS.map((g) => g.id).filter((g) => !prefs.goals.includes(g))];

  const hello = (c: Community) =>
    ask(`Draft a short, friendly hello from ${myName} to ${c.name} on The Pond. They offer ${c.offers.join(" and ")} and need ${c.needs.join(" and ")}. Share only our public community profile.`);

  return (
    <section className="os-pond" aria-labelledby="os-pond-title">
      {joined && mine && <p className="os-flash" role="status">{mine.name} is listed. Veridian will look for groups that fit what you give and need.</p>}
      <div className="os-pond-hero">
        <div>
          <div className="os-eyebrow-row">
            <span className="eyebrow">Partners · groups helping groups</span>
            <span className="os-demo-tag">sample groups</span>
          </div>
          <h1 id="os-pond-title">Find a group that has what you need</h1>
          <p className="sub">Each local group lists what it can give and what it needs. Veridian spots the pairs that fit, like a parent circle with spare volunteers and a nonprofit short on event help. Nothing is shared until both groups say yes.</p>
        </div>
        <div className="os-pond-ctas">
          <Link href="/social-scene/join" prefetch={false} className="os-btn os-btn-lg">{mine ? "Edit my listing" : "List my group"}</Link>
          <Link href="/social-scene/join?step=3" prefetch={false} className="os-btn-ghost os-btn-lg">Share my group</Link>
        </div>
      </div>

      <div className="os-filter">
        <label className="os-search">
          <IconSearch />
          <span className="vcta-sr-only">Search partners</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search groups, what they give, what they need" />
        </label>
        <div className="os-filter-chips" role="group" aria-label="Filter by goal">
          <button type="button" aria-pressed={goal === "all"} onClick={() => setGoal("all")}>all</button>
          {goalOrder.map((g) => (
            <button key={g} type="button" aria-pressed={goal === g} onClick={() => setGoal(g)}>{GOALS.find((x) => x.id === g)?.label ?? g}</button>
          ))}
        </div>
      </div>

      {ripples.length > 0 && (
        <section aria-labelledby="os-ripples">
          <h2 id="os-ripples" className="os-h2">Good matches right now</h2>
          <div className="os-ripples">
            {ripples.map((r) => {
              const done = proposed.includes(r.id);
              return (
                <article key={r.id} className="os-ripple">
                  <div className="os-ripple-pair">
                    <div>
                      <strong>{r.needer.name}</strong>
                      <span>needs {r.need}</span>
                    </div>
                    <span className="os-ripple-link" aria-hidden><IconLink /></span>
                    <div>
                      <strong>{r.offerer.name}</strong>
                      <span>offers {r.offer}</span>
                    </div>
                  </div>
                  <p className="os-ripple-why">{r.why}</p>
                  <div className="os-move-actions">
                    {done ? (
                      <span className="os-added">Added to your to-do list</span>
                    ) : (
                      <button
                        type="button"
                        className="os-btn"
                        onClick={() => {
                          if (addTasks([{ type: "add", id: null, title: `Suggest a match: ${r.needer.name} ↔ ${r.offerer.name} (${r.need})`, priority: "normal", dueDate: null }])) setProposed([...proposed, r.id]);
                        }}
                      >
                        Suggest this match
                      </button>
                    )}
                    <button type="button" className="os-btn-ghost" onClick={() => ask(`Draft a short intro between ${r.needer.name}, who needs ${r.need}, and ${r.offerer.name}, who offers ${r.offer}. Use only their public Pond profiles. Both sides approve before it's sent.`)}>Draft intro</button>
                    <span className="os-move-note"><IconLock />Both sides approve first</span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section aria-labelledby="os-communities">
        <h2 id="os-communities" className="os-h2">All groups</h2>
        {shown.length === 0 ? (
          <p className="sub">No groups match that yet. Try another filter or search.</p>
        ) : (
          <div className="os-communities">
            {shown.map((c) => (
              <article key={c.id} id={c.id === "yours" ? "yours" : c.id} className="os-community">
                <div className="os-community-head">
                  <span className="os-avatar" aria-hidden>{initials(c.name)}</span>
                  <div>
                    <h3>{c.name}</h3>
                    <span>{c.kind}</span>
                  </div>
                  {c.tag && <span className={`os-tag os-tag-${c.tag}`}>{c.tag}</span>}
                </div>
                <p className="os-community-meta">{c.area}{c.langs.length ? ` · ${c.langs.join(" · ")}` : ""}</p>
                <div className="os-community-lists">
                  <span className="os-list-label">offers</span>
                  <div className="os-chips">{c.offers.length ? c.offers.map((o) => <span key={o} className="os-pill">{o}</span>) : <span className="os-pill-empty">nothing listed yet</span>}</div>
                  <span className="os-list-label">needs</span>
                  <div className="os-chips">{c.needs.length ? c.needs.map((n) => <span key={n} className="os-pill os-pill-need">{n}</span>) : <span className="os-pill-empty">nothing listed yet</span>}</div>
                </div>
                {c.tag === "yours" ? (
                  <Link href="/social-scene/join" prefetch={false} className="os-btn-ghost os-community-cta">Edit my listing</Link>
                ) : (
                  <button type="button" className="os-btn-ghost os-community-cta" onClick={() => hello(c)}>Draft a hello</button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <p className="os-privacy"><IconLock size={16} />Partners only see what a group marks public: name, area, languages, offers and needs. Never notes, donors or case records.</p>
    </section>
  );
}
