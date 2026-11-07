/**
 * Veridian Desk — domain contracts.
 *
 * One consented, push-to-talk desk for a nonprofit (B2B) and the people in its
 * community (B2C). Every record carries a data class. The agent-to-agent
 * network may only ever carry PUBLIC_COMMUNITY.
 */

import type { MatchProposal } from "@/lib/social-scene/types";

export type DataClass = "PUBLIC_COMMUNITY" | "OPERATIONAL" | "DONOR" | "CLINICAL";

export type Lang = "en" | "es" | "ht";

export type ProfileId =
  | "marisol"
  | "denise"
  | "yesenia"
  | "reginald"
  | "owen"
  | "claudette"
  | "beatriz"
  | "ana"
  | "luis";

export type OrgId = "tidepath" | "mangrove";

export type Side = "B2B" | "B2C";

export type BoardId =
  | "calls"
  | "donors"
  | "workshops"
  | "notes"
  | "staffing"
  | "recruiting"
  | "grants"
  | "colony"
  | "network"
  | "person";

export type Source = "voice" | "script" | "typed";

export type Org = {
  id: OrgId;
  name: string;
  kind: string;
  area: string;
  languages: Lang[];
  fictional: true;
};

export type Preferences = {
  callListGrouping?: "school";
};

export type Offer = {
  roles: string[];
  areas: string[];
  languages: Lang[];
  /** "weekends" | "weekdays" | "evenings" */
  availability: string[];
};

export type Profile = {
  id: ProfileId;
  name: string;
  fullName: string;
  role: string;
  side: Side;
  orgId?: OrgId;
  boards: BoardId[];
  preferences: Preferences;
  /** B2C only: what this person already offered to do. */
  offer?: Offer;
};

/* ------------------------------------------------------------------ node */

export type NodeStatus = "IDLE" | "ARMED" | "LISTENING" | "WORKING" | "FILED";

export type NodeTransition = { at: string; from: NodeStatus; to: NodeStatus; why: string };

export type NodeState = {
  status: NodeStatus;
  /** One status line for the OLED / LCD. */
  line: string;
  armedAt: string | null;
  statusAt: string;
  urgent: boolean;
  urgentId: string | null;
  urgentLine: string | null;
  presenceUntil: string | null;
  log: NodeTransition[];
};

/* --------------------------------------------------------------- records */

export type CardRef = { board: BoardId; id: string; label: string };

export type Note = {
  id: string;
  at: string;
  author: ProfileId;
  board: BoardId;
  dataClass: DataClass;
  lang: Lang;
  text: string;
  subject?: string;
  /** CLINICAL only: the one line a funder may see, plus the ledger fact it counts toward. */
  funderView?: { text: string; ledgerId: string };
  filedKey: string;
};

export type Mentee = {
  id: string;
  name: string;
  area: string;
  school: string;
  guardian: string;
};

export type CallItem = {
  id: string;
  who: string;
  about: string;
  school: string;
  reason: string;
  dueBy: string;
  lang: Lang | null;
  status: "open" | "done";
  createdAt: string;
  createdBy: ProfileId | "seed";
  entityKey: string;
};

export type Family = {
  id: string;
  name: string;
  lang: Lang;
  school: string;
  summary: string;
  enteredBy: "staff";
};

export type Gift = { id: string; date: string; amount: number; via?: string };

export type Donor = {
  id: string;
  name: string;
  email: string;
  source: string;
  gifts: Gift[];
  mergedFrom?: string[];
  mergedAt?: string;
  flaggedBy?: ProfileId;
};

export type WorkshopItem = { id: string; label: string; owner: string; done: boolean };

export type Workshop = {
  id: string;
  school: string;
  topic: string;
  lang: Lang;
  date: string;
  status: "slides-pending" | "slides-approved" | "confirmed";
  checklist: WorkshopItem[];
  requestedBy: ProfileId;
  createdAt: string;
  entityKey: string;
};

export type HoursEntry = {
  id: string;
  personId: ProfileId;
  hours: number;
  date: string;
  loggedBy: ProfileId;
  at: string;
  entityKey: string;
};

export type Shift = {
  id: string;
  orgId: OrgId;
  role: string;
  area: string;
  date: string;
  time: string;
  lang: string;
  status: "open" | "filled";
  filledBy: ProfileId | null;
  urgent: boolean;
  routedTo: ProfileId[];
  createdBy: ProfileId;
  createdAt: string;
  /** Set when two orgs agreed to share this run. The driver still confirms. */
  sharedWith: string | null;
  entityKey: string;
};

export type RecruitOffer = {
  id: string;
  shiftId: string;
  personId: ProfileId;
  orgId: OrgId;
  /** One sentence: why this person was asked. */
  reason: string;
  status: "pending" | "accepted" | "declined";
  createdAt: string;
  respondedAt: string | null;
};

export type StandingRole = {
  id: string;
  orgId: OrgId;
  title: string;
  area: string;
  lang: string;
  status: "open" | "filled";
};

export type Colony = {
  id: string;
  orgId: OrgId;
  name: string;
  area: string;
  status: string;
  need: string | null;
  updatedAt: string | null;
  updatedBy: ProfileId | null;
  matchedWith: string | null;
  dataClass: "PUBLIC_COMMUNITY";
};

export type PublicNeed = {
  id: string;
  orgId: OrgId;
  kind: "driver-run" | "food-run" | "shift";
  /** Built from structured fields only, never from raw speech. */
  text: string;
  area: string;
  date: string;
  dataClass: "PUBLIC_COMMUNITY";
  createdAt: string;
  status: "open" | "matched" | "closed";
  entityKey: string;
};

export type ConsentState = "pending" | "accepted" | "declined";

/** B2B network match. `proposal` is the Agentscene agent-protocol shape, unchanged. */
export type NetworkMatch = {
  id: string;
  proposal: MatchProposal;
  needIds: [string, string];
  orgs: [OrgId, OrgId];
  consent: Record<OrgId, ConsentState>;
  publicText: string;
  area: string;
  date: string;
  dataClass: "PUBLIC_COMMUNITY";
  createdAt: string;
  acceptedAt: string | null;
};

export type LedgerEntry = {
  id: string;
  label: string;
  value: number;
  unit: "usd" | "count";
  source: string;
  updatedAt: string;
};

export type Grant = {
  id: string;
  name: string;
  funder: string;
  awardLedgerId: string;
  spentLedgerId: string;
  rule: string;
  disallowed: string[];
};

export type DraftParagraph = { text: string; cites: string[] };

export type GrantDraft = {
  id: string;
  grantId: string;
  title: string;
  createdAt: string;
  requestedBy: ProfileId;
  paragraphs: DraftParagraph[];
  /** Figures stripped by the ledger guard ("removed — not in the ledger"). */
  removed: string[];
  figures: { raw: string; ledgerId: string }[];
};

export type FeedItem = {
  id: string;
  at: string;
  speaker: ProfileId | "desk";
  text: string;
  lang: Lang;
  cards: CardRef[];
  via: string;
};

export type FiledEntry = {
  key: string;
  at: string;
  speaker: ProfileId | "unknown";
  text: string;
  lang: Lang;
  cards: CardRef[];
  spoken: string;
};

export type DeskState = {
  version: 1;
  seededAt: string;
  orgs: Record<OrgId, Org>;
  profiles: Record<ProfileId, Profile>;
  node: NodeState;
  filed: Record<string, FiledEntry>;
  feed: FeedItem[];
  notes: Note[];
  mentees: Mentee[];
  calls: CallItem[];
  families: Family[];
  donors: Donor[];
  workshops: Workshop[];
  hours: HoursEntry[];
  shifts: Shift[];
  recruits: RecruitOffer[];
  standingRoles: StandingRole[];
  colonies: Colony[];
  needs: PublicNeed[];
  matches: NetworkMatch[];
  ledger: Record<string, LedgerEntry>;
  grants: Grant[];
  drafts: GrantDraft[];
  voiceGuide: { rules: string[]; samples: string[] };
};

/* ------------------------------------------------------------ pipeline */

export type ToolName =
  | "fileCaseNote"
  | "reviewDonors"
  | "createWorkshopRequest"
  | "fileClinicalNote"
  | "logHours"
  | "openShift"
  | "draftGrantUpdate"
  | "updateColony"
  | "filePersonalNote"
  | "fileGeneralNote";

export type ToolCall = { tool: ToolName; args: Record<string, unknown> };

export type ToolCtx = {
  now: Date;
  today: string;
  speaker: ProfileId;
  text: string;
  body: string;
  lang: Lang;
  filedKey: string;
};

export type ToolResult = {
  cards: CardRef[];
  /** On-screen confirmation. */
  say: string;
  /** One short spoken sentence for OpenAI to read back. */
  spoken: string;
  /** True when every effect of this call already existed (say-it-once). */
  deduped: boolean;
};

export type HearInput = {
  text: string;
  lang?: Lang;
  source: Source;
  profileHint?: ProfileId;
  now?: Date;
};

export type AssistantMode = "chat" | "plan" | "file";
export type AssistantMessage = { role: "user" | "assistant"; text: string };
export type ExecutiveTask = { title: string; owner: ProfileId; dueBy: string | null; priority: "urgent" | "normal"; requiresApproval: boolean };
export type AssistantPlan = { reply: string; lang: Lang; tasks: ExecutiveTask[]; actions: ToolCall[] };

export type HearOutcome = {
  ok: boolean;
  alreadyFiled: boolean;
  speaker: ProfileId | "unknown";
  text: string;
  lang: Lang;
  cards: CardRef[];
  say: string;
  spoken: string;
  route: "gpt" | "script" | "rules" | "note";
  scriptId: string | null;
};
