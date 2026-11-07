/** Social Scene domain contracts — marketplace pond + Your Social Scene. */

export type Visibility = "private" | "unlisted" | "public";

export type EventRole = "hosting" | "attending";

export type AutonomyLevel = "suggest" | "draft" | "supervised" | "autonomous";

export type DataClass = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "HIGHLY_SENSITIVE";

export type OfferingCategory =
  | "food_bev"
  | "fitness_wellness"
  | "arts_culture"
  | "professional"
  | "tech"
  | "education"
  | "nonprofit"
  | "enterprise"
  | "other_legal";

export type GoalKind =
  | "grow_community"
  | "bd_pipeline"
  | "find_collaborators"
  | "fill_event"
  | "hire"
  | "learn"
  | "custom";

export type RecommendationKind =
  | "event"
  | "profile"
  | "host"
  | "community"
  | "offering";

export type MatchIntentKind =
  | "PROPOSE_INTRO"
  | "PROPOSE_EVENT"
  | "PROPOSE_COLLAB"
  | "SHARE_CAPABILITY_CARD"
  | "COUNTER"
  | "ACCEPT"
  | "DECLINE";

export type SceneEventRef = {
  id: string;
  eventId: string;
  name: string;
  url?: string | null;
  start?: string | null;
  city?: string | null;
  role: EventRole;
  visibility: Visibility;
  source: "luma" | "ticketmaster" | "eventbrite" | "partiful" | "manual" | "import";
  addedAt: string;
};

export type AttendeeEdge = {
  id: string;
  eventId: string;
  profileId: string;
  visibility: Visibility;
  createdAt: string;
};

export type Offering = {
  id: string;
  title: string;
  summary: string;
  category: OfferingCategory;
  city?: string | null;
  url?: string | null;
  legalAttested: boolean;
  visibility: Visibility;
};

export type Goal = {
  id: string;
  kind: GoalKind;
  statement: string;
  priority: 1 | 2 | 3;
  active: boolean;
};

export type AgentBinding = {
  id: string;
  agentRef: string;
  label: string;
  autonomy: AutonomyLevel;
  mcpServerIds: string[];
  maxActionsPerDay: number;
  /** Actions logged today (UTC date key) */
  actionsToday: number;
  actionsDayKey: string; // YYYY-MM-DD
  dataCeiling: DataClass;
  enabled: boolean;
};

export type Community = {
  id: string;
  ownerProfileId: string;
  name: string;
  tagline: string;
  description: string;
  city?: string | null;
  categories: OfferingCategory[];
  eventRefs: SceneEventRef[];
  visibility: Visibility;
  heat: number;
  followerIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type SocialNetworkLink = {
  network: "instagram" | "x" | "facebook" | "spotify" | "linkedin";
  url: string;
  handle: string;
};

export type SocialProfile = {
  id: string;
  handle: string;
  displayName: string;
  bio: string;
  avatarUrl?: string | null;
  cities: string[];
  communityIds: string[];
  followedCommunityIds: string[];
  offerings: Offering[];
  goals: Goal[];
  agents: AgentBinding[];
  /** Attested public social URLs — packed into agent capability cards */
  socialLinks: SocialNetworkLink[];
  visibility: Visibility;
  lookingFor: string[];
  createdAt: string;
  updatedAt: string;
};

export type Recommendation = {
  id: string;
  kind: RecommendationKind;
  title: string;
  reason: string;
  score: number;
  targetId: string;
  href?: string;
  draft?: string;
  source: "veridian" | "agent" | "heuristic";
};

export type CapabilityCard = {
  profileId: string;
  displayName: string;
  lookingFor: string[];
  offering: string[];
  cities: string[];
  categories: OfferingCategory[];
  goals: string[];
  social: string[];
  dataClass: DataClass;
};

export type MatchProposal = {
  id: string;
  kind: MatchIntentKind;
  fromProfileId: string;
  toProfileId: string;
  fromAgentRef: string;
  toAgentRef?: string;
  payload: {
    message: string;
    eventId?: string;
    communityId?: string;
    capabilityCard?: CapabilityCard;
  };
  status: "pending" | "accepted" | "declined" | "countered" | "expired";
  createdAt: string;
  updatedAt: string;
};

export type AgentActionLog = {
  id: string;
  at: string;
  agentRef: string;
  action: string;
  detail: string;
  autonomy: AutonomyLevel;
};

export type SocialSceneStore = {
  version: 1;
  localProfileId: string | null;
  profiles: Record<string, SocialProfile>;
  communities: Record<string, Community>;
  attendees: AttendeeEdge[];
  matches: MatchProposal[];
  recommendations: Recommendation[];
  auditLog: AgentActionLog[];
  pondSeeded: boolean;
};
