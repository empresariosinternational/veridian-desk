/**
 * Veridian Social Scene recommendations — deterministic heuristics.
 * Later: model re-rank via MCP + open local models.
 */

import type { Digest } from "@/lib/luma";
import type { CrmContact } from "@/lib/crm";
import type { Community, Recommendation, SocialProfile, SocialSceneStore } from "./types";
import { newId } from "./store";

type RecInput = {
  store: SocialSceneStore;
  profile: SocialProfile | null;
  digest?: Digest | null;
  crm?: CrmContact[];
  sceneQs?: string;
};

export function buildRecommendations(input: RecInput): Recommendation[] {
  const out: Recommendation[] = [];
  const { store, profile, digest, crm = [], sceneQs = "" } = input;
  const qs = sceneQs ? `?${sceneQs}` : "";
  const cities = new Set(
    (profile?.cities?.length ? profile.cities : digest?.cities ?? []).map((c) =>
      c.toLowerCase(),
    ),
  );
  const myCats = new Set(
    [
      ...(profile?.offerings.map((o) => o.category) ?? []),
      ...Object.values(store.communities)
        .filter((c) => profile?.communityIds.includes(c.id))
        .flatMap((c) => c.categories),
    ],
  );

  if (digest) {
    const all = [...Object.values(digest.groups).flat(), ...digest.elsewhere];
    const featured = all
      .filter((e) => e.overlap > 1)
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 4);
    for (const e of featured) {
      out.push({
        id: newId("rec"),
        kind: "event",
        title: e.name,
        reason: `${e.overlap} of your follows converge (${e.match_city ?? e.city}) — pin this into a community.`,
        score: 72 + e.overlap * 8,
        targetId: e.id,
        href: e.url ?? undefined,
        draft: `hey — I'll be at ${e.name}. would love to connect if you're around.`,
        source: "veridian",
      });
    }

    for (const h of digest.following.filter((f) => f.events > 0).slice(0, 2)) {
      out.push({
        id: newId("rec"),
        kind: "host",
        title: h.name,
        reason: `${h.events} upcoming — Veridian flags a host check-in for BD / community growth.`,
        score: 70,
        targetId: h.id,
        draft: `hey ${h.name.split(" ")[0]} — following your events closely. open to a quick intro?`,
        source: "veridian",
      });
    }
  }

  const communities = Object.values(store.communities).filter((c) => c.visibility !== "private");
  for (const c of rankCommunities(communities, cities, myCats).slice(0, 4)) {
    if (profile && c.ownerProfileId === profile.id) continue;
    const catHit = c.categories.some((x) => myCats.has(x));
    out.push({
      id: newId("rec"),
      kind: "community",
      title: c.name,
      reason: catHit
        ? `category overlap with your offerings — heat ${Math.round(c.heat)}.`
        : c.tagline || `rising in the pond · heat ${Math.round(c.heat)}.`,
      score: 48 + Math.min(40, c.heat / 2) + (catHit ? 10 : 0),
      targetId: c.id,
      href: `/social-scene/c/${c.id}${qs}`,
      source: "heuristic",
    });
  }

  const mySocial = new Set((profile?.socialLinks ?? []).map((l) => l.network));

  // Offering discovery across pond profiles
  for (const p of Object.values(store.profiles)) {
    if (profile && p.id === profile.id) continue;
    if (p.visibility === "private") continue;
    const socialOverlap = (p.socialLinks ?? []).filter((l) => mySocial.has(l.network)).length;
    for (const o of p.offerings.slice(0, 1)) {
      if (o.visibility === "private") continue;
      const cityHit = o.city && cities.has(o.city.toLowerCase());
      out.push({
        id: newId("rec"),
        kind: "offering",
        title: o.title,
        reason: socialOverlap
          ? `${p.displayName} · shared social channels (${socialOverlap}) — stronger intro signal.`
          : cityHit
            ? `${p.displayName} · near your cities — agent-ready collab.`
            : `${p.displayName} in the pond — ${o.category.replace("_", " ")}.`,
        score: 45 + (cityHit ? 15 : 0) + socialOverlap * 6,
        targetId: p.id,
        href: `/social-scene/p/${p.id}${qs}`,
        draft: `hey ${p.displayName.split(" ")[0]} — our social scenes might fit. open to an agent intro?`,
        source: "veridian",
      });
    }
  }

  if (profile && (profile.socialLinks?.length ?? 0) === 0) {
    out.push({
      id: newId("rec"),
      kind: "profile",
      title: "add social profiles",
      reason: "Instagram, X, LinkedIn, Spotify, Facebook — pack into your agent capability card.",
      score: 38,
      targetId: profile.id,
      href: `/social-scene/connections${qs}`,
      source: "veridian",
    });
  }

  for (const contact of crm
    .filter((c) => c.status === "new" || c.status === "reach_out" || c.status === "follow_up")
    .slice(0, 2)) {
    out.push({
      id: newId("rec"),
      kind: "profile",
      title: contact.name,
      reason: "CRM pipeline — Veridian suggests a Social Scene intro before the week fills.",
      score: 58,
      targetId: contact.id,
      href: `/crm${qs}`,
      draft: `hey ${contact.name.split(" ")[0]} — would love to connect around events this week.`,
      source: "veridian",
    });
  }

  const goal = profile?.goals.find((g) => g.active);
  if (goal && (!profile || profile.communityIds.length === 0)) {
    out.push({
      id: newId("rec"),
      kind: "community",
      title: "start your first community",
      reason: `goal: ${goal.statement} — curate 3 events into Your Social Scene to unlock agent BD.`,
      score: 42,
      targetId: "new",
      href: `/social-scene/yours${qs}`,
      source: "veridian",
    });
  }

  // Dedupe by kind+title
  const seen = new Set<string>();
  const unique: Recommendation[] = [];
  for (const r of out.sort((a, b) => b.score - a.score)) {
    const key = `${r.kind}:${r.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(r);
    if (unique.length >= 10) break;
  }
  return unique;
}

function rankCommunities(
  communities: Community[],
  cities: Set<string>,
  myCats: Set<string>,
): Community[] {
  return [...communities].sort((a, b) => {
    const score = (c: Community) =>
      c.heat +
      (c.city && cities.has(c.city.toLowerCase()) ? 20 : 0) +
      (c.categories.some((x) => myCats.has(x)) ? 15 : 0);
    return score(b) - score(a);
  });
}
