"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { canPlaySpoken, primeSpokenAudio, speakWithPersonality } from "@/lib/desk/browser-voice";
import { createSeedState } from "@/lib/desk/seed";
import type { Lang } from "@/lib/desk/types";
import { useListing } from "@/lib/os/pond";
import { AUTONOMY, CHANNELS, GOALS, goalLabel, usePrefs, type GoalId } from "@/lib/os/prefs";
import VeridianMark from "@/components/VeridianMark";
import { IconCheck, IconLock } from "./Icons";

const CLASSES = [
  { label: "Public community profile", meta: "Name, area, languages, offers, needs", shared: true },
  { label: "Operations", meta: "Shifts, call lists, workshop requests", shared: false },
  { label: "Donors and gifts", meta: "Names, emails, amounts", shared: false },
  { label: "Clinical", meta: "Counseling notes. Funders see counts only.", shared: false },
];

/** Your Veridian: what it works toward, what it knows, how far it goes, how it sounds. */
export default function YourVeridian() {
  const [prefs, setPrefs] = usePrefs();
  const [listing] = useListing();
  const [voices, setVoices] = useState<{ en: string; es: string } | null>(null);
  const [playable, setPlayable] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const guide = useMemo(() => createSeedState().voiceGuide, []);
  const ledgerCount = useMemo(() => Object.keys(createSeedState().ledger).length, []);

  useEffect(() => {
    setPlayable(canPlaySpoken());
    fetch("/api/desk/state", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { voiceReady?: { voices?: { en?: { name?: string }; es?: { name?: string } } } }) => {
        const en = j.voiceReady?.voices?.en?.name;
        const es = j.voiceReady?.voices?.es?.name;
        if (en && es) setVoices({ en, es });
      })
      .catch(() => setVoices(null));
  }, []);

  const on = prefs.goals;
  const off = GOALS.map((g) => g.id).filter((g) => !on.includes(g));
  const move = (g: GoalId, by: -1 | 1) => {
    const i = on.indexOf(g);
    const j = i + by;
    if (i < 0 || j < 0 || j >= on.length) return;
    const next = [...on];
    [next[i], next[j]] = [next[j], next[i]];
    setPrefs({ ...prefs, goals: next });
  };
  const drop = (g: GoalId) => on.length > 1 && setPrefs({ ...prefs, goals: on.filter((x) => x !== g) });
  const add = (g: GoalId) => setPrefs({ ...prefs, goals: [...on, g] });

  const play = (text: string, lang: Lang) => {
    setNotice(null);
    primeSpokenAudio();
    void speakWithPersonality(text, lang, () => setNotice("The spoken voice isn't available right now. The text above is what Veridian would say."));
  };

  const addLink = () => {
    const v = link.trim();
    if (!v) return;
    if (!/^https?:\/\/\S+\.\S+/i.test(v)) return setNotice("Add a full link that starts with https://");
    setPrefs({ ...prefs, links: Array.from(new Set([...prefs.links, v])) });
    setLink("");
    setNotice(null);
  };

  return (
    <section className="os-setup" aria-labelledby="os-setup-title">
      <div className="os-setup-hero">
        <div>
          <div className="eyebrow">Settings</div>
          <h1 id="os-setup-title">Teach your assistant</h1>
          <p className="sub">Tell Veridian what matters most, what it should know, and how much it can do without asking. It uses this on every page.</p>
        </div>
        <p className="os-setup-voice"><VeridianMark size={18} />Changes save in this browser as you make them.</p>
      </div>

      {notice && <p className="os-flash" role="status">{notice}</p>}

      <div className="os-setup-grid">
        <section id="goals" className="os-panel" aria-labelledby="s-goals">
          <h2 id="s-goals">Goals, in order</h2>
          <p className="sub">Your top goal decides what shows up first on Home and Partners.</p>
          <ol className="os-goal-list">
            {on.map((g, i) => (
              <li key={g}>
                <span className="os-stage-n">{i + 1}</span>
                <span className="os-goal-name">{goalLabel(g)}<small>{GOALS.find((x) => x.id === g)?.hint}</small></span>
                <span className="os-goal-buttons">
                  <button type="button" onClick={() => move(g, -1)} disabled={i === 0} aria-label={`Move ${goalLabel(g)} up`}>↑</button>
                  <button type="button" onClick={() => move(g, 1)} disabled={i === on.length - 1} aria-label={`Move ${goalLabel(g)} down`}>↓</button>
                  <button type="button" onClick={() => drop(g)} disabled={on.length === 1} aria-label={`Remove ${goalLabel(g)}`}>×</button>
                </span>
              </li>
            ))}
          </ol>
          {off.length > 0 && (
            <div className="os-chips">
              {off.map((g) => <button key={g} type="button" className="os-choice" onClick={() => add(g)}><span aria-hidden>+</span>{goalLabel(g)}</button>)}
            </div>
          )}
        </section>

        <section id="autonomy" className="os-panel" aria-labelledby="s-auto">
          <h2 id="s-auto">How far Veridian goes on its own</h2>
          <p className="sub">Whatever you pick, anything that leaves your team waits for your approval, and partner intros need both sides to say yes.</p>
          <div className="os-autonomy" role="radiogroup" aria-labelledby="s-auto">
            {AUTONOMY.map((a) => (
              <label key={a.id} className={`os-radio${prefs.autonomy === a.id ? " is-on is-violet" : ""}`}>
                <input type="radio" name="autonomy" value={a.id} checked={prefs.autonomy === a.id} onChange={() => setPrefs({ ...prefs, autonomy: a.id })} />
                <span><strong>{a.label}</strong><small>{a.blurb}</small></span>
              </label>
            ))}
          </div>
        </section>

        <section className="os-panel" aria-labelledby="s-know">
          <h2 id="s-know">What Veridian knows</h2>
          <p className="sub">Context it may draw on. Figures come only from your facts log.</p>
          <ul className="os-source-list">
            <li><strong>Your partner listing</strong><span>{listing ? `${listing.name} · ${listing.offers.length} offers, ${listing.needs.length} needs` : "Not listed yet. "}{!listing && <Link href="/social-scene/join" prefetch={false}>Join The Pond</Link>}</span></li>
            <li><strong>Voice guide</strong><span>{guide.rules.length} rules and {guide.samples.length} sample lines</span></li>
            <li><strong>Facts log</strong><span>{ledgerCount} figures Veridian may quote, nothing else</span></li>
            <li><strong>Calendar and events</strong><span>What's coming up in your scene</span></li>
            {prefs.links.map((l) => (
              <li key={l}>
                <strong>Link</strong>
                <span className="os-source-link">{l}<button type="button" className="os-btn-text" onClick={() => setPrefs({ ...prefs, links: prefs.links.filter((x) => x !== l) })} aria-label={`Remove ${l}`}>Remove</button></span>
              </li>
            ))}
          </ul>
          <form className="os-add-row" onSubmit={(e) => { e.preventDefault(); addLink(); }}>
            <label className="vcta-sr-only" htmlFor="os-link">Add a link for Veridian</label>
            <input id="os-link" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://your-site.org/about" />
            <button type="submit" className="os-btn-ghost">Add link</button>
          </form>
        </section>

        <section className="os-panel" aria-labelledby="s-sound">
          <h2 id="s-sound">How Veridian sounds</h2>
          <p className="sub">{guide.rules.join(" ")}</p>
          {guide.samples.map((s, i) => {
            const lang: Lang = /[ñáéíóú¿¡]|\b(cuando|su|la|el|llamamos)\b/i.test(s) ? "es" : "en";
            return (
              <div key={i} className="os-sample">
                <blockquote lang={lang}>{s}</blockquote>
                <button type="button" className="os-btn-ghost" onClick={() => play(s, lang)} disabled={!playable}>Play</button>
              </div>
            );
          })}
          <p className="os-muted">{voices ? `Spoken voice · English: ${voices.en} · Spanish: ${voices.es}` : "Spoken voice comes from Deepgram on the server."}</p>
        </section>

        <section className="os-panel" aria-labelledby="s-reach">
          <h2 id="s-reach">Where you reach Veridian</h2>
          {CHANNELS.map((c) => (
            <label key={c.id} className="os-toggle-row">
              <span><strong>{c.label}</strong><small>{c.meta}</small></span>
              <input type="checkbox" checked={prefs.channels[c.id]} disabled={c.id === "chat"} onChange={(e) => setPrefs({ ...prefs, channels: { ...prefs.channels, [c.id]: e.target.checked } })} />
            </label>
          ))}
        </section>

        <section className="os-panel" aria-labelledby="s-leave">
          <h2 id="s-leave">What leaves your desk</h2>
          <p className="sub">The desk checks anything it shares with partners against this list. Drafts never send on their own.</p>
          <ul className="os-class-list">
            {CLASSES.map((k) => (
              <li key={k.label}>
                <span><strong>{k.label}</strong><small>{k.meta}</small></span>
                {k.shared ? <span className="os-class-shared"><IconCheck /> can be shared</span> : <span className="os-class-kept"><IconLock /> stays on your desk</span>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
