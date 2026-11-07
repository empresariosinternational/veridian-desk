"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { statusPop } from "@/lib/motion";

export default function AddHost({ currentFollows, currentCities }: { currentFollows: string[]; currentCities: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const reduce = useReducedMotion();
  const followsKey = currentFollows.join(",");

  // When the URL actually changes (follows list updates), clear the in-flight UI.
  useEffect(() => {
    if (status && (status.startsWith("adding") || status.startsWith("resolving"))) {
      const m = status.match(/^adding (.+?)…?$/);
      setStatus(m ? `added ${m[1]} ✓` : null);
      setInput("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followsKey]);

  // Auto-fade success messages after a few seconds.
  useEffect(() => {
    if (status && status.startsWith("added")) {
      const t = setTimeout(() => setStatus(null), 3500);
      return () => clearTimeout(t);
    }
  }, [status]);

  async function add() {
    const val = input.trim();
    if (!val || pending) return;
    setStatus(`resolving ${val}…`);
    try {
      const r = await fetch(`/api/resolve?url=${encodeURIComponent(val)}`).then((r) => r.json());
      if (!r?.id) {
        setStatus(r?.error ? `couldn't resolve: ${r.error}` : "couldn't resolve that URL");
        return;
      }
      if (currentFollows.includes(r.id)) {
        setStatus(`already following ${r.name ?? r.id}`);
        return;
      }
      const next = [...currentFollows, r.id];
      const params = new URLSearchParams();
      if (currentCities.length) params.set("cities", currentCities.join(","));
      params.set("follows", next.join(","));
      setStatus(`adding ${r.name ?? r.id}…`);
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`);
      });
    } catch (e) {
      setStatus(`error: ${String(e)}`);
    }
  }

  return (
    <motion.div
      className="add-host"
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={reduce ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
    >
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="paste a luma profile URL or handle to add"
        disabled={pending}
        onKeyDown={(e) => { if (e.key === "Enter") add(); }}
      />
      <motion.button
        onClick={add}
        disabled={pending || !input.trim()}
        whileTap={reduce ? undefined : { scale: 0.97 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      >
        {pending ? "…" : "add"}
      </motion.button>
      <AnimatePresence mode="wait">
        {status && (
          <motion.div
            key={status}
            className="add-status"
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
  );
}
