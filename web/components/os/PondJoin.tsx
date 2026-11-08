"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { captureSpeech, speechRecognition, type VoiceCapture } from "@/lib/desk/browser-voice";
import { initials, loadListing, saveListing, type Listing, type Reach } from "@/lib/os/pond";
import { GOALS, type GoalId } from "@/lib/os/prefs";
import { IconCheck, IconLock, IconMic } from "./Icons";

const KINDS = ["Nonprofit", "Community group", "Parent or school group", "Faith community", "Small business", "Startup", "Other"];
const LANGS = ["EN", "ES", "HT"];
const OFFER_IDEAS = ["family workshops", "mentoring", "event volunteers", "event space", "weekend drivers", "bilingual tutors", "sponsors"];
const NEED_IDEAS = ["event helpers", "Spanish-speaking mentor", "drivers", "sponsors", "study space", "community partners"];
const REACH: { id: Reach; label: string; meta: string }[] = [
  { id: "nearby", label: "Nearby communities first", meta: "Your neighborhoods see you at the top of The Pond." },
  { id: "goals", label: "Communities with matching goals", meta: "Shown wherever your offers meet someone's needs." },
  { id: "everyone", label: "The whole pond", meta: "Every community can find you." },
];

/** "We run family workshops and need event helpers" → offers and needs. English and Spanish. */
export function parseSpoken(text: string): { offers: string[]; needs: string[] } {
  const clean = (s: string) =>
    s
      .replace(/\b(we|our team|nosotros)\b/gi, " ")
      .replace(/\b(run|offer|have|do|host|provide|ofrecemos|tenemos|hacemos|damos)\b/gi, " ")
      .split(/,|\band\b|\by\b|\bplus\b/i)
      .map((x) => x.replace(/[.!?]+$/g, "").replace(/\s+/g, " ").trim().toLowerCase())
      .filter((x) => x.length > 2 && x.length < 60);
  const [before, ...rest] = text.split(/\b(?:need|needs|looking for|necesitamos|necesita|buscamos)\b/i);
  return { offers: clean(before ?? ""), needs: rest.length ? clean(rest.join(" ")) : [] };
}

function ChipSet({ legend, values, ideas, onChange, tone = "ocean" }: { legend: string; values: string[]; ideas: string[]; onChange: (v: string[]) => void; tone?: "ocean" | "violet" }) {
  const [draft, setDraft] = useState("");
  const toggle = (v: string) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  const options = Array.from(new Set([...values, ...ideas]));
  return (
    <fieldset className="os-fieldset">
      <legend>{legend}</legend>
      <div className="os-chips">
        {options.map((v) => (
          <button key={v} type="button" className={`os-choice${values.includes(v) ? ` is-on is-${tone}` : ""}`} aria-pressed={values.includes(v)} onClick={() => toggle(v)}>
            {values.includes(v) ? <IconCheck /> : <span aria-hidden>+</span>}
            {v}
          </button>
        ))}
      </div>
      <div className="os-add-row">
        <label className="vcta-sr-only" htmlFor={`add-${legend}`}>Add to {legend.toLowerCase()}</label>
        <input id={`add-${legend}`} value={draft} maxLength={60} onChange={(e) => setDraft(e.target.value)} placeholder="Add your own" onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const v = draft.trim().toLowerCase();
            if (v && !values.includes(v)) onChange([...values, v]);
            setDraft("");
          }
        }} />
      </div>
    </fieldset>
  );
}

export default function PondJoin() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [kind, setKind] = useState(KINDS[0]);
  const [area, setArea] = useState("");
  const [langs, setLangs] = useState<string[]>(["EN"]);
  const [offers, setOffers] = useState<string[]>([]);
  const [needs, setNeeds] = useState<string[]>([]);
  const [goals, setGoals] = useState<GoalId[]>(["staffing", "recruiting"]);
  const [reach, setReach] = useState<Reach>("nearby");
  const [error, setError] = useState<string | null>(null);
  const [heard, setHeard] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceOk, setVoiceOk] = useState(false);
  const [voiceLang, setVoiceLang] = useState<"en-US" | "es-US">("en-US");
  const capture = useRef<VoiceCapture | null>(null);

  useEffect(() => {
    setVoiceOk(Boolean(speechRecognition()));
    const l = loadListing();
    if (l) {
      setName(l.name); setKind(l.kind); setArea(l.area); setLangs(l.langs); setOffers(l.offers); setNeeds(l.needs); setGoals(l.goals); setReach(l.reach);
    }
    const s = Number(new URLSearchParams(window.location.search).get("step"));
    if ((s === 2 || s === 3) && l) setStep(s);
    return () => capture.current?.abort();
  }, []);

  const startVoice = () => {
    if (capture.current) return;
    setError(null);
    try {
      const c = captureSpeech(voiceLang);
      capture.current = c;
      setListening(true);
      void c.result.then((r) => {
        if (capture.current !== c) return;
        if (r.error || r.aborted) {
          capture.current = null;
          setListening(false);
          if (r.error) setError(r.error);
        }
      });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const stopVoice = async () => {
    const c = capture.current;
    if (!c) return;
    c.stop();
    const r = await c.result;
    capture.current = null;
    setListening(false);
    if (r.aborted) return;
    if (r.error || !r.text) return setError(r.error ?? "I didn't hear anything. Hold the mic while you talk.");
    const parsed = parseSpoken(r.text);
    setHeard(r.text);
    if (parsed.offers.length) setOffers((v) => Array.from(new Set([...v, ...parsed.offers])));
    if (parsed.needs.length) setNeeds((v) => Array.from(new Set([...v, ...parsed.needs])));
  };

  const next = () => {
    setError(null);
    if (step === 1) {
      if (!name.trim()) return setError("Give your community a name.");
      if (!area.trim()) return setError("Add the neighborhood or area you serve.");
    }
    if (step === 2 && !offers.length && !needs.length) return setError("Add at least one offer or need so Veridian can find ripples.");
    if (step < 3) return setStep(step + 1);
    const listing: Listing = { version: 1, name: name.trim(), kind, area: area.trim(), langs, offers, needs, goals, reach, joinedAt: new Date().toISOString() };
    if (!saveListing(listing)) return setError("This browser blocked storage, so the listing can't be saved here.");
    router.push("/social-scene?joined=1#yours");
  };

  const steps = ["your community", "offers and needs", "promotion and privacy"];

  return (
    <div className="os-join">
      <div className="os-join-top">
        <div className="eyebrow">join the pond</div>
        <Link href="/social-scene" prefetch={false} className="os-btn-ghost">Back to The Pond</Link>
      </div>
      <ol className="os-steps" aria-label="Steps">
        {steps.map((s, i) => (
          <li key={s} className={i + 1 < step ? "is-done" : i + 1 === step ? "is-now" : undefined} aria-current={i + 1 === step ? "step" : undefined}>
            <span className="os-step-n">{i + 1 < step ? <IconCheck /> : i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      <div className="os-join-grid">
        <form className="os-join-form" onSubmit={(e) => { e.preventDefault(); next(); }}>
          {step === 1 && (
            <>
              <h1>Tell The Pond who you are.</h1>
              <p className="sub">This is your public community profile. It's the only thing other communities ever see.</p>
              <label className="os-field">
                <span>Community name</span>
                <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Tidepath Family Alliance" required />
              </label>
              <label className="os-field">
                <span>What kind of community</span>
                <select value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
              </label>
              <label className="os-field">
                <span>Neighborhoods or area you serve</span>
                <input value={area} maxLength={100} onChange={(e) => setArea(e.target.value)} placeholder="Little Havana, West Little River" required />
              </label>
              <fieldset className="os-fieldset">
                <legend>Languages you work in</legend>
                <div className="os-chips">
                  {LANGS.map((l) => (
                    <button key={l} type="button" className={`os-choice${langs.includes(l) ? " is-on is-ocean" : ""}`} aria-pressed={langs.includes(l)} onClick={() => setLangs(langs.includes(l) ? langs.filter((x) => x !== l) : [...langs, l])}>
                      {langs.includes(l) ? <IconCheck /> : <span aria-hidden>+</span>}{l === "EN" ? "English" : l === "ES" ? "Spanish" : "Haitian Creole"}
                    </button>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {step === 2 && (
            <>
              <h1>What do you offer, and what do you need?</h1>
              <p className="sub">Veridian uses this to find ripples with other communities. You can change it any time.</p>
              <div className="os-voice-fill">
                <button
                  type="button"
                  className={`os-voice-btn${listening ? " is-listening" : ""}`}
                  disabled={!voiceOk}
                  aria-label={voiceOk ? "Hold to tell Veridian" : "Voice is not available in this browser"}
                  onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); startVoice(); }}
                  onPointerUp={() => void stopVoice()}
                  onKeyDown={(e) => { if ((e.key === " " || e.key === "Enter") && !e.repeat) { e.preventDefault(); startVoice(); } }}
                  onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); void stopVoice(); } }}
                >
                  <IconMic size={22} />
                </button>
                <div>
                  <strong>{listening ? "Listening… let go when you're done" : "Just say it, and Veridian fills this in"}</strong>
                  <span>{heard ? `Heard: “${heard}”` : voiceOk ? "“We run family workshops and need event helpers for Give Miami Day.”" : "Voice isn't available in this browser. Pick or type below."}</span>
                </div>
                <button type="button" className="os-dock-lang" onClick={() => setVoiceLang(voiceLang === "en-US" ? "es-US" : "en-US")} aria-label={`Voice language: ${voiceLang === "en-US" ? "English" : "Spanish"}. Switch`}>{voiceLang === "en-US" ? "EN" : "ES"}</button>
              </div>
              <ChipSet legend="We offer" values={offers} ideas={OFFER_IDEAS} onChange={setOffers} />
              <ChipSet legend="We need" values={needs} ideas={NEED_IDEAS} onChange={setNeeds} />
              <fieldset className="os-fieldset">
                <legend>Goals Veridian should work on</legend>
                <div className="os-chips">
                  {GOALS.map((g) => (
                    <button key={g.id} type="button" className={`os-choice${goals.includes(g.id) ? " is-on is-violet" : ""}`} aria-pressed={goals.includes(g.id)} onClick={() => setGoals(goals.includes(g.id) ? goals.filter((x) => x !== g.id) : [...goals, g.id])}>
                      {goals.includes(g.id) ? <IconCheck /> : <span aria-hidden>+</span>}{g.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {step === 3 && (
            <>
              <h1>Who should see you first?</h1>
              <p className="sub">Promotion decides where you show up. Privacy doesn't change: only your public profile is ever shared.</p>
              <fieldset className="os-fieldset">
                <legend>Promotion</legend>
                <div className="os-radio-list">
                  {REACH.map((r) => (
                    <label key={r.id} className={`os-radio${reach === r.id ? " is-on" : ""}`}>
                      <input type="radio" name="reach" value={r.id} checked={reach === r.id} onChange={() => setReach(r.id)} />
                      <span><strong>{r.label}</strong><small>{r.meta}</small></span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {error && <p className="os-error" role="alert">{error}</p>}
          <div className="os-join-actions">
            {step > 1 && <button type="button" className="os-btn-ghost os-btn-lg" onClick={() => { setError(null); setStep(step - 1); }}>Back</button>}
            <button type="submit" className="os-btn os-btn-lg">{step === 1 ? "Continue to offers and needs" : step === 2 ? "Continue to promotion and privacy" : "Join The Pond"}</button>
          </div>
        </form>

        <aside className="os-join-preview" aria-label="Preview">
          <div className="os-list-label">how you'll appear</div>
          <article className="os-community">
            <div className="os-community-head">
              <span className="os-avatar" aria-hidden>{initials(name || "Your community")}</span>
              <div>
                <h3>{name || "Your community"}</h3>
                <span>{kind}</span>
              </div>
            </div>
            <p className="os-community-meta">{area || "Your area"}{langs.length ? ` · ${langs.join(" · ")}` : ""}</p>
            <div className="os-chips">
              {offers.map((o) => <span key={o} className="os-pill">{o}</span>)}
              {needs.map((n) => <span key={n} className="os-pill os-pill-need">{n}</span>)}
              {!offers.length && !needs.length && <span className="os-pill-empty">offers and needs show here</span>}
            </div>
          </article>
          <section className="os-shared">
            <h2>What The Pond can see</h2>
            <p><IconCheck /> Name, area and languages</p>
            <p><IconCheck /> Offers and needs</p>
            <p><IconCheck /> A reply route through Veridian, never your email</p>
            <p className="is-kept"><IconLock /> Desk notes, call lists and case records</p>
            <p className="is-kept"><IconLock /> Donors, gifts and anything clinical</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
