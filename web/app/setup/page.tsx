"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import FadeIn from "@/components/motion/FadeIn";
import { statusPop } from "@/lib/motion";

export default function Setup() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [zip, setZip] = useState("");
  const [seed, setSeed] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setStatus("building your scene…");
    try {
      const params = new URLSearchParams();
      let cityFound: string | null = null;
      if (zip.trim()) {
        setStatus(`looking up ${zip.trim()}…`);
        const r = await fetch(`/api/zip?zip=${encodeURIComponent(zip.trim())}`).then((r) => r.json());
        if (r?.city) { cityFound = r.city; params.set("cities", r.city); }
      }
      if (seed.trim()) {
        setStatus("pulling in their orbit…");
        const r = await fetch(`/api/seed?url=${encodeURIComponent(seed.trim())}`).then((r) => r.json());
        if (r?.follows?.length) params.set("follows", r.follows.join(","));
      }
      if (!params.has("cities") && !params.has("follows")) {
        setStatus("need at least a zip or a host to go on.");
        setLoading(false);
        return;
      }
      setStatus(cityFound ? `found ${cityFound} · loading your scene…` : "loading your scene…");
      router.push(`/?${params.toString()}`);
    } catch (e) {
      setStatus(`something broke: ${String(e)}`);
      setLoading(false);
    }
  }

  return (
    <>
      <FadeIn>
        <div className="eyebrow">welcome</div>
        <h1>set the scene.</h1>
        <p className="sub" style={{ marginTop: 8 }}>
          tell us where you are. paste one host you like. that's the whole setup — no signup.
        </p>
      </FadeIn>

      <FadeIn delay={0.08}>
      <motion.div
        className="form-card"
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={reduce ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
      >
        <label className="field">
          <span className="label">your zip</span>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            placeholder="33139"
            disabled={loading}
          />
          <span className="hint">resolved to a city. multi-zip support coming.</span>
        </label>

        <label className="field">
          <span className="label">a host you like <span className="opt">· optional</span></span>
          <input
            type="text"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="luma.com/u/benmilshtein  or  usr-Sixs4X5XSYAjDXB"
            disabled={loading}
          />
          <span className="hint">we'll pull them + up to 9 people they've recently co-hosted with.</span>
        </label>

        <motion.button
          className="submit"
          onClick={submit}
          disabled={loading}
          whileTap={reduce ? undefined : { scale: 0.98 }}
          whileHover={reduce ? undefined : { y: -1 }}
        >
          {loading ? "…" : "show me the scene →"}
        </motion.button>
        <AnimatePresence mode="wait">
          {status && (
            <motion.div
              key={status}
              className="status"
              variants={statusPop}
              initial="hidden"
              animate="show"
              exit="exit"
            >
              {status}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      </FadeIn>

      <FadeIn delay={0.14}>
      <div className="explain" style={{ marginTop: 28 }}>
        <strong>What is this?</strong> Luma is the website people use to throw events. You can follow whole <em>communities</em> on it, but not individual <em>people</em>. This fills that gap — give it a zip + one host, and it builds you a feed of what your favorite organizers are throwing next, flagging the events where multiple of them overlap.
      </div>
      </FadeIn>
    </>
  );
}
