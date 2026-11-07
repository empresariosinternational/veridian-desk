/** Demo pond — small fish + large fish so discovery isn't empty. */

import type { Community, SocialProfile, SocialSceneStore } from "./types";
import { newId } from "./store";

const SEED_MARK = "seed-pond-v1";

export function seedPondIfNeeded(store: SocialSceneStore, cities: string[]): SocialSceneStore {
  if (store.pondSeeded) return store;
  // Avoid re-seeding if seed profiles already present
  if (Object.keys(store.profiles).some((id) => id.startsWith("seed-"))) {
    return { ...store, pondSeeded: true };
  }

  const city = cities[0] || "Miami";
  const city2 = cities[1] || "San Francisco";
  const now = new Date().toISOString();

  const mkProfile = (
    id: string,
    handle: string,
    displayName: string,
    bio: string,
    cats: Community["categories"],
    offeringTitle: string,
    lookingFor: string[],
  ): SocialProfile => ({
    id,
    handle,
    displayName,
    bio,
    avatarUrl: null,
    cities: [city, city2],
    communityIds: [],
    followedCommunityIds: [],
    offerings: [
      {
        id: newId("off"),
        title: offeringTitle,
        summary: bio,
        category: cats[0] ?? "other_legal",
        city,
        url: null,
        legalAttested: true,
        visibility: "public",
      },
    ],
    goals: [
      {
        id: newId("goal"),
        kind: "grow_community",
        statement: `grow ${displayName} through Social Scene`,
        priority: 1,
        active: true,
      },
    ],
    agents: [
      {
        id: newId("agent"),
        agentRef: `veridian-${handle}`,
        label: `${displayName} agent`,
        autonomy: "draft",
        mcpServerIds: ["agentscene.social", "agentscene.match"],
        maxActionsPerDay: 15,
        actionsToday: 0,
        actionsDayKey: now.slice(0, 10),
        dataCeiling: "CONFIDENTIAL",
        enabled: true,
      },
    ],
    socialLinks: [],
    visibility: "public",
    lookingFor,
    createdAt: now,
    updatedAt: now,
  });

  const cafe = mkProfile(
    "seed-cafe",
    "corner-cup",
    "Corner Cup Café",
    "neighborhood coffee + community tables. small fish, strong roots.",
    ["food_bev"],
    "Corner Cup — coffee & community tables",
    ["morning regulars", "local creators", "pop-up collabs"],
  );
  const yoga = mkProfile(
    "seed-yoga",
    "sunrise-flow",
    "Sunrise Flow Studio",
    "yoga + breathwork for founders who actually need to unclench.",
    ["fitness_wellness"],
    "Sunrise Flow classes",
    ["wellness hosts", "corporate wellness", "retreat partners"],
  );
  const salon = mkProfile(
    "seed-salon",
    "ai-salon",
    "Enterprise AI Salon",
    "F500 + scale-up operators. large fish, still in the same pond.",
    ["enterprise", "tech"],
    "Enterprise AI Salon dinners",
    ["operators", "security leads", "marketplace builders"],
  );
  const maker = mkProfile(
    "seed-maker",
    "brickell-makers",
    "Brickell Makers",
    "open studio nights for designers and builders.",
    ["arts_culture", "tech"],
    "Maker nights",
    ["sponsors", "workshop teachers", "gallery swaps"],
  );

  const mkCommunity = (
    id: string,
    owner: SocialProfile,
    name: string,
    tagline: string,
    categories: Community["categories"],
    heat: number,
    eventName: string,
  ): Community => ({
    id,
    ownerProfileId: owner.id,
    name,
    tagline,
    description: `${tagline} Seeded for Social Scene discovery (${SEED_MARK}).`,
    city,
    categories,
    eventRefs: [
      {
        id: newId("eref"),
        eventId: `seed-ev-${id}`,
        name: eventName,
        url: null,
        start: new Date(Date.now() + 86400000 * 2).toISOString(),
        city,
        role: "hosting",
        visibility: "public",
        source: "manual",
        addedAt: now,
      },
    ],
    visibility: "public",
    heat,
    followerIds: [],
    createdAt: now,
    updatedAt: now,
  });

  const c1 = mkCommunity(
    "seed-com-cafe",
    cafe,
    "Morning Table",
    "coffee, laptops, and real conversations before the city wakes up",
    ["food_bev", "professional"],
    62,
    "Friday Morning Table @ Corner Cup",
  );
  const c2 = mkCommunity(
    "seed-com-yoga",
    yoga,
    "Unclench Club",
    "flow + founders — sweat, then soft networking",
    ["fitness_wellness"],
    55,
    "Sunrise Flow — Founders Edition",
  );
  const c3 = mkCommunity(
    "seed-com-salon",
    salon,
    "Operator Circle",
    "enterprise AI operators — dinners, not decks",
    ["enterprise", "tech"],
    78,
    "Operator Circle Dinner",
  );
  const c4 = mkCommunity(
    "seed-com-maker",
    maker,
    "Open Studio Circuit",
    "makers sharing process, not just polished work",
    ["arts_culture", "tech"],
    48,
    "Brickell Open Studio Night",
  );

  cafe.communityIds = [c1.id];
  yoga.communityIds = [c2.id];
  salon.communityIds = [c3.id];
  maker.communityIds = [c4.id];

  return {
    ...store,
    pondSeeded: true,
    profiles: {
      ...store.profiles,
      [cafe.id]: cafe,
      [yoga.id]: yoga,
      [salon.id]: salon,
      [maker.id]: maker,
    },
    communities: {
      ...store.communities,
      [c1.id]: c1,
      [c2.id]: c2,
      [c3.id]: c3,
      [c4.id]: c4,
    },
  };
}
