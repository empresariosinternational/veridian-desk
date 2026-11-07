/**
 * Social Scene persistence v0 — device-local.
 * Swap this module for an encrypted vault later without changing UI contracts.
 */

import type {
  AgentActionLog,
  AutonomyLevel,
  Community,
  EventRole,
  MatchProposal,
  Offering,
  SceneEventRef,
  SocialProfile,
  SocialSceneStore,
  Recommendation,
  Visibility,
} from "./types";
import type { EventRow } from "@/lib/luma";

const STORAGE_KEY = "agentscene.social-scene.v1";

export function emptySocialStore(): SocialSceneStore {
  return {
    version: 1,
    localProfileId: null,
    profiles: {},
    communities: {},
    attendees: [],
    matches: [],
    recommendations: [],
    auditLog: [],
    pondSeeded: false,
  };
}

function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function normalizeProfile(p: SocialProfile): SocialProfile {
  return {
    ...p,
    followedCommunityIds: p.followedCommunityIds ?? [],
    lookingFor: p.lookingFor ?? [],
    socialLinks: p.socialLinks ?? [],
    agents: (p.agents ?? []).map((a) => ({
      ...a,
      actionsToday: a.actionsToday ?? 0,
      actionsDayKey: a.actionsDayKey ?? utcDayKey(),
    })),
  };
}

function normalizeCommunity(c: Community): Community {
  return {
    ...c,
    followerIds: c.followerIds ?? [],
    eventRefs: c.eventRefs ?? [],
  };
}

export function normalizeStore(raw: SocialSceneStore): SocialSceneStore {
  const profiles: Record<string, SocialProfile> = {};
  for (const [k, v] of Object.entries(raw.profiles ?? {})) profiles[k] = normalizeProfile(v);
  const communities: Record<string, Community> = {};
  for (const [k, v] of Object.entries(raw.communities ?? {})) communities[k] = normalizeCommunity(v);
  return {
    ...emptySocialStore(),
    ...raw,
    profiles,
    communities,
    auditLog: raw.auditLog ?? [],
    pondSeeded: Boolean(raw.pondSeeded),
  };
}

export function loadSocialStore(): SocialSceneStore {
  if (typeof window === "undefined") return emptySocialStore();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptySocialStore();
    const parsed = JSON.parse(raw) as SocialSceneStore;
    if (!parsed || parsed.version !== 1) return emptySocialStore();
    return normalizeStore(parsed);
  } catch {
    return emptySocialStore();
  }
}

export function saveSocialStore(store: SocialSceneStore): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function ensureLocalProfile(
  store: SocialSceneStore,
  cities: string[] = [],
): { store: SocialSceneStore; profile: SocialProfile } {
  if (store.localProfileId && store.profiles[store.localProfileId]) {
    let profile = normalizeProfile(store.profiles[store.localProfileId]);
    if (cities.length && profile.cities.length === 0) {
      profile = { ...profile, cities, updatedAt: new Date().toISOString() };
      return {
        store: upsertProfile(store, profile),
        profile,
      };
    }
    return { store: { ...store, profiles: { ...store.profiles, [profile.id]: profile } }, profile };
  }
  const now = new Date().toISOString();
  const id = newId("prof");
  const profile: SocialProfile = {
    id,
    handle: `you-${id.slice(-5)}`,
    displayName: "your profile",
    bio: "curate communities, showcase offerings, let Veridian grow your network.",
    avatarUrl: null,
    cities: [...cities],
    communityIds: [],
    followedCommunityIds: [],
    offerings: [],
    socialLinks: [],
    lookingFor: ["collaborators", "great events", "aligned communities"],
    goals: [
      {
        id: newId("goal"),
        kind: "grow_community",
        statement: "grow my social scene with the right people and events",
        priority: 1,
        active: true,
      },
    ],
    agents: [
      {
        id: newId("agent"),
        agentRef: "veridian",
        label: "Veridian OS",
        autonomy: "draft",
        mcpServerIds: ["agentscene.social", "agentscene.crm", "agentscene.match", "agentscene.bd"],
        maxActionsPerDay: 20,
        actionsToday: 0,
        actionsDayKey: utcDayKey(),
        dataCeiling: "CONFIDENTIAL",
        enabled: true,
      },
    ],
    visibility: "unlisted",
    createdAt: now,
    updatedAt: now,
  };
  return {
    store: {
      ...store,
      localProfileId: id,
      profiles: { ...store.profiles, [id]: profile },
    },
    profile,
  };
}

export function upsertProfile(store: SocialSceneStore, profile: SocialProfile): SocialSceneStore {
  return {
    ...store,
    profiles: {
      ...store.profiles,
      [profile.id]: { ...normalizeProfile(profile), updatedAt: new Date().toISOString() },
    },
  };
}

export function computeHeat(community: Community): number {
  const events = community.eventRefs.length;
  const followers = community.followerIds.length;
  const publicEvents = community.eventRefs.filter((e) => e.visibility === "public").length;
  return Math.min(100, 8 + events * 12 + publicEvents * 4 + followers * 6);
}

export function upsertCommunity(store: SocialSceneStore, community: Community): SocialSceneStore {
  const withHeat = {
    ...normalizeCommunity(community),
    heat: computeHeat(community),
    updatedAt: new Date().toISOString(),
  };
  const owner = store.profiles[withHeat.ownerProfileId];
  let profiles = store.profiles;
  if (owner && !owner.communityIds.includes(withHeat.id)) {
    profiles = {
      ...profiles,
      [owner.id]: {
        ...normalizeProfile(owner),
        communityIds: [...owner.communityIds, withHeat.id],
        updatedAt: new Date().toISOString(),
      },
    };
  }
  return {
    ...store,
    profiles,
    communities: { ...store.communities, [withHeat.id]: withHeat },
  };
}

export function deleteCommunity(store: SocialSceneStore, communityId: string): SocialSceneStore {
  const c = store.communities[communityId];
  if (!c) return store;
  const { [communityId]: _, ...rest } = store.communities;
  const profiles = { ...store.profiles };
  for (const id of Object.keys(profiles)) {
    const p = profiles[id];
    profiles[id] = {
      ...p,
      communityIds: p.communityIds.filter((x) => x !== communityId),
      followedCommunityIds: (p.followedCommunityIds ?? []).filter((x) => x !== communityId),
    };
  }
  return { ...store, communities: rest, profiles };
}

export function eventRowToRef(
  e: EventRow,
  role: EventRole,
  visibility: Visibility = "public",
): SceneEventRef {
  return {
    id: newId("eref"),
    eventId: e.id,
    name: e.name,
    url: e.url,
    start: e.start,
    city: e.match_city ?? e.city,
    role,
    visibility,
    source: "luma",
    addedAt: new Date().toISOString(),
  };
}

export function attachEventToCommunity(
  store: SocialSceneStore,
  communityId: string,
  ref: SceneEventRef,
): SocialSceneStore {
  const c = store.communities[communityId];
  if (!c) return store;
  if (c.eventRefs.some((x) => x.eventId === ref.eventId && x.role === ref.role)) return store;
  return upsertCommunity(store, { ...c, eventRefs: [ref, ...c.eventRefs] });
}

export function detachEventFromCommunity(
  store: SocialSceneStore,
  communityId: string,
  refId: string,
): SocialSceneStore {
  const c = store.communities[communityId];
  if (!c) return store;
  return upsertCommunity(store, {
    ...c,
    eventRefs: c.eventRefs.filter((x) => x.id !== refId),
  });
}

export function followCommunity(
  store: SocialSceneStore,
  profileId: string,
  communityId: string,
): SocialSceneStore {
  const p = store.profiles[profileId];
  const c = store.communities[communityId];
  if (!p || !c) return store;
  if (p.followedCommunityIds.includes(communityId)) return store;
  const nextP = {
    ...p,
    followedCommunityIds: [...p.followedCommunityIds, communityId],
  };
  const nextC = {
    ...c,
    followerIds: c.followerIds.includes(profileId) ? c.followerIds : [...c.followerIds, profileId],
  };
  return upsertCommunity(upsertProfile(store, nextP), nextC);
}

export function unfollowCommunity(
  store: SocialSceneStore,
  profileId: string,
  communityId: string,
): SocialSceneStore {
  const p = store.profiles[profileId];
  const c = store.communities[communityId];
  if (!p || !c) return store;
  const nextP = {
    ...p,
    followedCommunityIds: p.followedCommunityIds.filter((id) => id !== communityId),
  };
  const nextC = {
    ...c,
    followerIds: c.followerIds.filter((id) => id !== profileId),
  };
  return upsertCommunity(upsertProfile(store, nextP), nextC);
}

export function addOffering(store: SocialSceneStore, profileId: string, offering: Offering): SocialSceneStore {
  const p = store.profiles[profileId];
  if (!p) return store;
  return upsertProfile(store, { ...p, offerings: [offering, ...p.offerings] });
}

export function removeOffering(store: SocialSceneStore, profileId: string, offeringId: string): SocialSceneStore {
  const p = store.profiles[profileId];
  if (!p) return store;
  return upsertProfile(store, {
    ...p,
    offerings: p.offerings.filter((o) => o.id !== offeringId),
  });
}

export function listPublicCommunities(store: SocialSceneStore): Community[] {
  return Object.values(store.communities)
    .filter((c) => c.visibility === "public" || c.visibility === "unlisted")
    .sort((a, b) => b.heat - a.heat);
}

export function listMatchesForProfile(store: SocialSceneStore, profileId: string): MatchProposal[] {
  return store.matches
    .filter((m) => m.toProfileId === profileId || m.fromProfileId === profileId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function setRecommendations(
  store: SocialSceneStore,
  recs: Recommendation[],
): SocialSceneStore {
  return { ...store, recommendations: recs };
}

export function logAgentAction(
  store: SocialSceneStore,
  entry: Omit<AgentActionLog, "id" | "at">,
): SocialSceneStore {
  const log: AgentActionLog = {
    ...entry,
    id: newId("log"),
    at: new Date().toISOString(),
  };
  return { ...store, auditLog: [log, ...store.auditLog].slice(0, 80) };
}

/** Consume one autonomous/supervised action budget; returns null if blocked. */
export function tryConsumeAgentBudget(
  store: SocialSceneStore,
  profileId: string,
  agentRef: string,
): { store: SocialSceneStore; allowed: boolean; reason?: string } {
  const p = store.profiles[profileId];
  if (!p) return { store, allowed: false, reason: "no profile" };
  const idx = p.agents.findIndex((a) => a.agentRef === agentRef || a.id === agentRef);
  if (idx < 0) return { store, allowed: false, reason: "no agent" };
  let agent = { ...p.agents[idx] };
  const today = utcDayKey();
  if (agent.actionsDayKey !== today) {
    agent = { ...agent, actionsDayKey: today, actionsToday: 0 };
  }
  if (agent.autonomy === "suggest") {
    return { store, allowed: false, reason: "autonomy is suggest-only" };
  }
  if (agent.actionsToday >= agent.maxActionsPerDay) {
    return { store, allowed: false, reason: "daily budget exhausted" };
  }
  if (agent.autonomy === "draft") {
    // drafts don't consume send budget
    return { store, allowed: true };
  }
  agent = { ...agent, actionsToday: agent.actionsToday + 1 };
  const agents = [...p.agents];
  agents[idx] = agent;
  return { store: upsertProfile(store, { ...p, agents }), allowed: true };
}

export function setAgentAutonomy(
  store: SocialSceneStore,
  profileId: string,
  autonomy: AutonomyLevel,
): SocialSceneStore {
  const p = store.profiles[profileId];
  if (!p) return store;
  const agents = p.agents.map((a, i) => (i === 0 ? { ...a, autonomy } : a));
  return upsertProfile(store, { ...p, agents });
}

export function exportSocialJson(store: SocialSceneStore): string {
  return JSON.stringify(store, null, 2);
}

export function importSocialJson(raw: string): SocialSceneStore {
  const parsed = JSON.parse(raw) as SocialSceneStore;
  if (!parsed || parsed.version !== 1) throw new Error("invalid Social Scene export");
  return normalizeStore(parsed);
}

export function digestEventPool(digest: {
  groups: Record<string, EventRow[]>;
  elsewhere: EventRow[];
}): EventRow[] {
  const map = new Map<string, EventRow>();
  for (const e of [...Object.values(digest.groups).flat(), ...digest.elsewhere]) {
    map.set(e.id, e);
  }
  return [...map.values()].sort((a, b) => {
    if (!a.start) return 1;
    if (!b.start) return -1;
    return a.start < b.start ? -1 : 1;
  });
}
