/**
 * The Pond: communities list what they offer and what they need; Veridian finds
 * the ripples (one community's need meeting another's offer). Only the public
 * community profile is ever shown or shared here.
 *
 * Tidepath Family Alliance and Mangrove Mews are the desk's fictional seed orgs.
 * The others are demo communities, and the page says so.
 */
import { useCallback, useEffect, useState } from "react";
import type { GoalId } from "./prefs";

export type Reach = "nearby" | "goals" | "everyone";

export type Community = {
  id: string;
  name: string;
  kind: string;
  area: string;
  langs: string[];
  offers: string[];
  needs: string[];
  goals: GoalId[];
  tag?: "new" | "promoted" | "yours";
};

export const POND_COMMUNITIES: Community[] = [
  { id: "tidepath", name: "Tidepath Family Alliance", kind: "Family nonprofit", area: "Little Havana, West Little River", langs: ["EN", "ES", "HT"], offers: ["family workshops", "mentoring"], needs: ["event helpers", "Spanish-speaking mentor"], goals: ["staffing", "recruiting", "events"] },
  { id: "mangrove-mews", name: "Mangrove Mews", kind: "Cat rescue", area: "Miami-Dade", langs: ["EN", "ES"], offers: ["adoption events"], needs: ["food-run drivers"], goals: ["volunteering", "events"] },
  { id: "riverbend-parents-circle", name: "Riverbend Parents Circle", kind: "Parent group", area: "Riverbend K-8", langs: ["EN", "HT", "ES"], offers: ["event volunteers"], needs: ["evening workshops"], goals: ["events", "volunteering"], tag: "new" },
  { id: "coral-lantern-tutors", name: "Coral Lantern Tutors", kind: "Tutoring collective", area: "Little Havana", langs: ["ES", "EN"], offers: ["bilingual tutors"], needs: ["study space"], goals: ["recruiting", "volunteering"] },
  { id: "anchor-line-drivers", name: "Anchor Line Drivers", kind: "Volunteer drivers", area: "West Little River", langs: ["EN", "ES"], offers: ["weekend drivers"], needs: ["fuel sponsors"], goals: ["volunteering", "staffing"] },
  { id: "saltmarsh-founders-club", name: "Saltmarsh Founders Club", kind: "Founders network", area: "Miami-Dade", langs: ["EN"], offers: ["sponsors", "pro bono help"], needs: ["community partners"], goals: ["bd", "fundraising"], tag: "promoted" },
];

/** Words that make a need and an offer the same kind of help. */
const CATEGORIES: { id: string; test: RegExp }[] = [
  { id: "event-help", test: /event (helper|volunteer)|volunteers?\b|helpers?\b/i },
  { id: "mentoring", test: /mentor|tutor/i },
  { id: "driving", test: /driv|food-run|food run/i },
  { id: "workshops", test: /workshop/i },
  { id: "sponsorship", test: /sponsor|pro bono|funding/i },
  { id: "space", test: /space|venue|room/i },
  { id: "partners", test: /partner/i },
];

export function categoryOf(text: string): string | null {
  return CATEGORIES.find((c) => c.test.test(text))?.id ?? null;
}

const places = (s: string) => s.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);

/** Same neighborhood ("Little Havana" inside "Little Havana, West Little River"), or county-wide. */
export function sharesArea(a: string, b: string): boolean {
  if (/miami-dade/i.test(a) || /miami-dade/i.test(b)) return true;
  const pa = places(a);
  const pb = places(b);
  return pa.some((x) => pb.some((y) => x === y || x.includes(y) || y.includes(x)));
}

function sharedPlace(a: string, b: string): string {
  const pa = a.split(",").map((s) => s.trim());
  const pb = b.split(",").map((s) => s.trim());
  return pa.find((p) => pb.includes(p)) ?? "Miami-Dade";
}

export type Ripple = { id: string; needer: Community; need: string; offerer: Community; offer: string; why: string };

/** Each need meets at most one offer, the best local fit first. */
export function findRipples(list: Community[], max = 4): Ripple[] {
  const out: Ripple[] = [];
  for (const a of list) {
    for (const need of a.needs) {
      const cat = categoryOf(need);
      if (!cat) continue;
      const fits = list
        .filter((b) => b.id !== a.id)
        .flatMap((b) => b.offers.filter((o) => categoryOf(o) === cat).map((offer) => ({ b, offer, local: sharesArea(a.area, b.area) })))
        .sort((x, y) => Number(y.local) - Number(x.local));
      const best = fits[0];
      if (!best) continue;
      out.push({
        id: `${a.id}:${best.b.id}:${cat}`,
        needer: a,
        need,
        offerer: best.b,
        offer: best.offer,
        why: best.local ? `Both are in ${sharedPlace(a.area, best.b.area)}.` : "Different neighborhoods, same kind of help.",
      });
    }
  }
  return out.slice(0, max);
}

export type Listing = {
  version: 1;
  name: string;
  kind: string;
  area: string;
  langs: string[];
  offers: string[];
  needs: string[];
  goals: GoalId[];
  reach: Reach;
  joinedAt: string;
};

const KEY = "veridian-os.pond.listing.v1";
const EVENT = "veridian-os:pond";

export function loadListing(): Listing | null {
  if (typeof window === "undefined") return null;
  try {
    const l = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Listing | null;
    if (!l || l.version !== 1 || typeof l.name !== "string" || !l.name.trim() || !Array.isArray(l.offers) || !Array.isArray(l.needs)) return null;
    return { ...l, langs: Array.isArray(l.langs) ? l.langs : [], goals: Array.isArray(l.goals) ? l.goals : [] };
  } catch {
    return null;
  }
}

export function saveListing(l: Listing | null): boolean {
  let ok = true;
  try {
    if (l) window.localStorage.setItem(KEY, JSON.stringify(l));
    else window.localStorage.removeItem(KEY);
  } catch {
    ok = false;
  }
  window.dispatchEvent(new Event(EVENT));
  return ok;
}

export function listingAsCommunity(l: Listing): Community {
  return { id: "yours", name: l.name, kind: l.kind, area: l.area, langs: l.langs, offers: l.offers, needs: l.needs, goals: l.goals, tag: "yours" };
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : name.slice(0, 2)).toUpperCase();
}

export function useListing(): [Listing | null, (l: Listing | null) => void] {
  const [listing, setListing] = useState<Listing | null>(null);
  useEffect(() => {
    const sync = () => setListing(loadListing());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const update = useCallback((l: Listing | null) => {
    setListing(l);
    saveListing(l);
  }, []);
  return [listing, update];
}
