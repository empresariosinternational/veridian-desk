"use client";

import { useEffect, useState } from "react";
import { nodeView, settle } from "@/lib/desk/node";
import type { DeskState, NodeStatus } from "@/lib/desk/types";

export type NodeGlance = { status: NodeStatus | "OFFLINE"; color: "white" | "red" | "amber" | "green" | "gray"; blink: boolean } | null;

/** Same key the desk console uses when this browser holds the desk (Vercel). */
export const DESK_STORE_KEY = "veridian-desk.state.v1";

export function localDesk(): DeskState | null {
  try {
    const raw = window.localStorage.getItem(DESK_STORE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as DeskState;
    return s?.version === 1 && s.node && typeof s.node.status === "string" && s.profiles ? s : null;
  } catch {
    return null;
  }
}

/** The front desk node's status for the sidebar: from this browser's desk, else the desk server. */
export function useDeskNode(): NodeGlance {
  const [glance, setGlance] = useState<NodeGlance>(null);
  useEffect(() => {
    let alive = true;
    const fromLocal = () => {
      const s = localDesk();
      if (!s) return false;
      const now = new Date();
      settle(s, now);
      const v = nodeView(s, now);
      if (alive) setGlance({ status: v.status, color: v.color, blink: v.blink });
      return true;
    };
    const poll = async () => {
      if (document.hidden || fromLocal()) return;
      try {
        const r = await fetch("/api/desk/state?view=node", { cache: "no-store" });
        if (!r.ok) throw new Error("desk unavailable");
        const v = (await r.json()) as { status: NodeStatus; color: "white" | "red" | "amber" | "green"; blink: boolean };
        if (alive) setGlance({ status: v.status, color: v.color, blink: v.blink });
      } catch {
        if (alive) setGlance({ status: "OFFLINE", color: "gray", blink: false });
      }
    };
    void poll();
    const id = window.setInterval(poll, 8000);
    const onStorage = (e: StorageEvent) => {
      if (e.key === DESK_STORE_KEY) fromLocal();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return glance;
}

export const NODE_WORDS: Record<NodeStatus | "OFFLINE", string> = {
  IDLE: "idle",
  ARMED: "armed",
  LISTENING: "listening",
  WORKING: "working",
  FILED: "filed",
  OFFLINE: "offline",
};
