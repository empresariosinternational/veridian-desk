/**
 * Truth ledger guard. Grant and quarterly text may only carry figures that
 * exist in the ledger. Anything else is stripped and shown as
 * "removed — not in the ledger".
 */

import type { Grant, LedgerEntry } from "./types";

export const REMOVED = "[removed — not in the ledger]";

export type Figure = { raw: string; index: number; value: number; money: boolean };

const FIGURE = /(\$\s?)?\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(\s?(?:k|thousand|million)\b)?/gi;
const MONTH_BEFORE = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*$/i;
const TIME_AFTER = /^\s?(?::\d|a\.?m\b|p\.?m\b)/i;

export function findFigures(text: string): Figure[] {
  const out: Figure[] = [];
  for (const m of text.matchAll(FIGURE)) {
    const raw = m[0].trim();
    const index = m.index ?? 0;
    const money = Boolean(m[1]);
    const before = text.slice(0, index);
    const after = text.slice(index + m[0].length);
    if (!money) {
      // Part of an id or a code such as K-8 or q3-workshops.
      if (/[A-Za-z]-$/.test(before) || /[A-Za-z0-9]$/.test(before)) continue;
      // Years, calendar dates and clock times are not claims.
      if (/^\d{4}$/.test(m[2]) && +m[2] >= 1900 && +m[2] <= 2099) continue;
      if (MONTH_BEFORE.test(before)) continue;
      if (TIME_AFTER.test(after)) continue;
    }
    let value = parseFloat(`${m[2].replace(/,/g, "")}${m[3] ? `.${m[3]}` : ""}`);
    const scale = (m[4] ?? "").trim().toLowerCase();
    if (scale === "k" || scale === "thousand") value *= 1_000;
    if (scale === "million") value *= 1_000_000;
    out.push({ raw, index: index + (m[0].length - m[0].trimStart().length), value, money });
  }
  return out;
}

export type LedgerCheck = {
  text: string;
  removed: string[];
  figures: { raw: string; ledgerId: string }[];
};

/**
 * Keep a figure only if a ledger entry has that exact value (and unit). When
 * `cites` is given, the figure must match one of the cited entries.
 */
export function enforceLedger(
  text: string,
  ledger: Record<string, LedgerEntry>,
  opts: { cites?: string[] } = {},
): LedgerCheck {
  const entries = Object.values(ledger).filter((e) => !opts.cites || opts.cites.includes(e.id));
  const figures = findFigures(text);
  const kept: { raw: string; ledgerId: string }[] = [];
  const removed: string[] = [];
  let out = text;
  for (const f of [...figures].reverse()) {
    const hit = entries.find((e) => e.value === f.value && (f.money ? e.unit === "usd" : e.unit === "count"));
    if (hit) {
      kept.unshift({ raw: f.raw, ledgerId: hit.id });
    } else {
      removed.unshift(f.raw);
      out = `${out.slice(0, f.index)}${REMOVED}${out.slice(f.index + f.raw.length)}`;
    }
  }
  return { text: out, removed, figures: kept };
}

/** Flags spending language the funder does not allow. */
export function checkFunderRule(text: string, grant: Grant): string | null {
  const hit = grant.disallowed.find((w) => new RegExp(`\\b${w}`, "i").test(text));
  return hit ? `Conflicts with the ${grant.name} rule: ${grant.rule}` : null;
}

export function fmtUSD(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}
