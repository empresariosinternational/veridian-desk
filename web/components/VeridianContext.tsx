"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import VeridianMark from "./VeridianMark";

const Context = createContext<{ open: boolean; setOpen: (open: boolean) => void } | null>(null);

export function VeridianProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useVeridian() {
  const context = useContext(Context);
  if (!context) throw new Error("Veridian needs its layout provider.");
  return context;
}

/** VCTA stays in the sticky navigation while the panel opens beside the current view. */
export function VeridianCTA() {
  const { open, setOpen } = useVeridian();
  return (
    <button id="veridian-cta" type="button" className={`vcta${open ? " vcta-open" : ""}`} aria-label="Ask Veridian using voice or text" aria-expanded={open} aria-controls="veridian-panel" onClick={() => setOpen(!open)}>
      <VeridianMark size={20} />
      <span>Ask Veridian</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></svg>
    </button>
  );
}
