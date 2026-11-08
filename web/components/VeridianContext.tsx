"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import VeridianMark from "./VeridianMark";
import { applyTaskActions, loadTasks, saveTasks, type TaskAction } from "@/lib/veridian/tasks";

type Source = "typed" | "voice";

/** Filled in by the Veridian panel once it mounts; pages call it through the context. */
export type VeridianBridge = {
  submit?: (text: string, source: Source) => void;
  addTasks?: (actions: TaskAction[]) => boolean;
  showTasks?: () => void;
};

type VeridianContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Open the panel and send this to Veridian, typed or as a voice transcript. */
  ask: (text: string, source?: Source) => void;
  /** Add to My priorities, even before the panel has loaded. */
  addTasks: (actions: TaskAction[]) => boolean;
  /** Open the panel on My priorities. */
  showTasks: () => void;
  bridge: MutableRefObject<VeridianBridge>;
  pending: MutableRefObject<{ text: string; source: Source } | null>;
};

const Context = createContext<VeridianContextValue | null>(null);

export function VeridianProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const bridge = useRef<VeridianBridge>({});
  const pending = useRef<{ text: string; source: Source } | null>(null);

  const ask = useCallback((text: string, source: Source = "typed") => {
    if (!text.trim()) return;
    setOpen(true);
    if (bridge.current.submit) bridge.current.submit(text, source);
    else pending.current = { text, source };
  }, []);

  const addTasks = useCallback((actions: TaskAction[]) => {
    if (bridge.current.addTasks) return bridge.current.addTasks(actions);
    try {
      return saveTasks(applyTaskActions(loadTasks(), actions));
    } catch {
      return false;
    }
  }, []);

  const showTasks = useCallback(() => {
    setOpen(true);
    bridge.current.showTasks?.();
  }, []);

  const value = useMemo(() => ({ open, setOpen, ask, addTasks, showTasks, bridge, pending }), [open, ask, addTasks, showTasks]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useVeridian() {
  const context = useContext(Context);
  if (!context) throw new Error("Veridian needs its layout provider.");
  return context;
}

/** VCTA opens the Veridian panel beside the current view. */
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
