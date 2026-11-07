/**
 * Agent-to-agent negotiation protocol for Social Scene matchmaking.
 */

import type {
  CapabilityCard,
  MatchIntentKind,
  MatchProposal,
  SocialProfile,
  SocialSceneStore,
} from "./types";
import { newId } from "./store";

export type AgentIntent = {
  kind: MatchIntentKind;
  fromProfileId: string;
  toProfileId: string;
  fromAgentRef: string;
  message: string;
  eventId?: string;
  communityId?: string;
  capabilityCard?: CapabilityCard;
};

export function capabilityCardFromProfile(profile: SocialProfile): CapabilityCard {
  return {
    profileId: profile.id,
    displayName: profile.displayName,
    lookingFor: profile.lookingFor?.length
      ? profile.lookingFor
      : profile.goals.filter((g) => g.active).map((g) => g.statement),
    offering: profile.offerings.map((o) => o.title),
    cities: profile.cities,
    categories: [...new Set(profile.offerings.map((o) => o.category))],
    goals: profile.goals.filter((g) => g.active).map((g) => g.statement),
    social: (profile.socialLinks ?? []).map((l) => `${l.network}:${l.handle}`),
    dataClass: "INTERNAL",
  };
}

export function createProposal(intent: AgentIntent): MatchProposal {
  const now = new Date().toISOString();
  return {
    id: newId("match"),
    kind: intent.kind,
    fromProfileId: intent.fromProfileId,
    toProfileId: intent.toProfileId,
    fromAgentRef: intent.fromAgentRef,
    payload: {
      message: intent.message,
      eventId: intent.eventId,
      communityId: intent.communityId,
      capabilityCard: intent.capabilityCard,
    },
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
}

export function appendProposal(store: SocialSceneStore, proposal: MatchProposal): SocialSceneStore {
  return { ...store, matches: [proposal, ...store.matches] };
}

export function resolveProposal(
  store: SocialSceneStore,
  proposalId: string,
  status: "accepted" | "declined" | "countered",
  counterMessage?: string,
): SocialSceneStore {
  const now = new Date().toISOString();
  return {
    ...store,
    matches: store.matches.map((m) => {
      if (m.id !== proposalId) return m;
      if (status === "countered") {
        return {
          ...m,
          kind: "COUNTER",
          status: "countered",
          payload: { ...m.payload, message: counterMessage ?? m.payload.message },
          updatedAt: now,
        };
      }
      return { ...m, status, updatedAt: now };
    }),
  };
}

function overlapScore(a: CapabilityCard, b: SocialProfile): number {
  let s = 0;
  const bCities = new Set(b.cities.map((c) => c.toLowerCase()));
  for (const c of a.cities) if (bCities.has(c.toLowerCase())) s += 2;
  const bCats = new Set(b.offerings.map((o) => o.category));
  for (const c of a.categories) if (bCats.has(c)) s += 3;
  const look = a.lookingFor.join(" ").toLowerCase();
  for (const o of b.offerings) {
    if (look.includes(o.category.replace("_", " ")) || look.includes(o.title.toLowerCase().slice(0, 8))) {
      s += 2;
    }
  }
  return s;
}

/**
 * Peer agent evaluates capability card vs own goals/offerings.
 * Used for seed peers and local simulation until real A2A transport.
 */
export function simulatePeerAgentReply(
  proposal: MatchProposal,
  peer?: SocialProfile | null,
): AgentIntent | null {
  if (proposal.status !== "pending") return null;
  if (
    proposal.kind !== "PROPOSE_INTRO" &&
    proposal.kind !== "PROPOSE_EVENT" &&
    proposal.kind !== "PROPOSE_COLLAB" &&
    proposal.kind !== "SHARE_CAPABILITY_CARD"
  ) {
    return null;
  }

  const card = proposal.payload.capabilityCard;
  let accept = false;
  if (peer && card) {
    accept = overlapScore(card, peer) >= 3;
  } else {
    const text = proposal.payload.message.toLowerCase();
    accept = text.includes("collab") || text.includes("event") || text.includes("intro") || text.includes("community");
  }

  return {
    kind: accept ? "ACCEPT" : "DECLINE",
    fromProfileId: proposal.toProfileId,
    toProfileId: proposal.fromProfileId,
    fromAgentRef: peer?.agents[0]?.agentRef ?? "veridian-peer",
    message: accept
      ? `agent for ${peer?.displayName ?? "peer"} accepted — mutual consent for a lightweight intro.`
      : `agent for ${peer?.displayName ?? "peer"} declined — goals/categories did not align this week.`,
    eventId: proposal.payload.eventId,
    communityId: proposal.payload.communityId,
  };
}

/** Auto-draft intros from Veridian to top pond profiles (draft autonomy). */
export function draftPondIntros(
  store: SocialSceneStore,
  from: SocialProfile,
  limit = 3,
): MatchProposal[] {
  const card = capabilityCardFromProfile(from);
  const targets = Object.values(store.profiles)
    .filter((p) => p.id !== from.id && p.visibility === "public" && p.id.startsWith("seed-"))
    .slice(0, limit);

  return targets.map((t) =>
    createProposal({
      kind: "PROPOSE_INTRO",
      fromProfileId: from.id,
      toProfileId: t.id,
      fromAgentRef: from.agents[0]?.agentRef ?? "veridian",
      message: `Veridian draft: ${from.displayName} ↔ ${t.displayName} — overlapping cities/categories for a community collab.`,
      capabilityCard: card,
    }),
  );
}

export const SOCIAL_MCP_TOOLS = [
  "social.get_profile",
  "social.upsert_community",
  "social.attach_event",
  "social.list_pond",
  "social.recommend",
  "social.propose_match",
  "social.resolve_match",
  "social.set_autonomy",
  "social.list_offerings",
  "social.follow_community",
] as const;

export type SocialMcpTool = (typeof SOCIAL_MCP_TOOLS)[number];
