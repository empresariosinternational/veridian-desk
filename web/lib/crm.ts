/** On-device CRM store — contacts live in localStorage, never on a server. */

export const CRM_STATUSES = ["new", "reach_out", "waiting", "met", "follow_up"] as const;
export type CrmStatus = (typeof CRM_STATUSES)[number];

export const CRM_STATUS_LABEL: Record<CrmStatus, string> = {
  new: "new",
  reach_out: "reach out",
  waiting: "waiting",
  met: "met",
  follow_up: "follow up",
};

export type CrmContact = {
  id: string;
  name: string;
  avatar?: string | null;
  /** Luma usr-id when known */
  lumaId?: string | null;
  status: CrmStatus;
  notes: string;
  nextAction: string;
  nextDue: string | null; // ISO date YYYY-MM-DD
  lastTouch: string | null; // ISO datetime
  tags: string[];
  source: "follow" | "host" | "manual" | "import";
  createdAt: string;
  updatedAt: string;
};

export type CrmStore = {
  version: 1;
  contacts: CrmContact[];
};

const STORAGE_KEY = "agentscene.crm.v1";

export function emptyStore(): CrmStore {
  return { version: 1, contacts: [] };
}

export function loadCrm(): CrmStore {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as CrmStore;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.contacts)) return emptyStore();
    return parsed;
  } catch {
    return emptyStore();
  }
}

export function saveCrm(store: CrmStore): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newContactId(): string {
  return `crm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

type SeedPerson = {
  id: string;
  name: string;
  avatar?: string | null;
  events?: number;
};

/** Seed contacts from follows / event hosts. Skips existing lumaIds and names. */
export function seedFromScene(
  store: CrmStore,
  opts: {
    following: SeedPerson[];
    hosts?: SeedPerson[];
  },
): CrmStore {
  const existingIds = new Set(store.contacts.map((c) => c.lumaId).filter(Boolean));
  const existingNames = new Set(store.contacts.map((c) => c.name.trim().toLowerCase()));
  const now = nowIso();
  const added: CrmContact[] = [];

  const push = (p: SeedPerson, source: "follow" | "host") => {
    if (existingIds.has(p.id)) return;
    const key = p.name.trim().toLowerCase();
    if (key && existingNames.has(key)) return;
    existingIds.add(p.id);
    if (key) existingNames.add(key);
    added.push({
      id: newContactId(),
      name: p.name,
      avatar: p.avatar ?? null,
      lumaId: p.id,
      status: "new",
      notes: "",
      nextAction: source === "follow" ? "check in before their next event" : "say hi at their event",
      nextDue: null,
      lastTouch: null,
      tags: source === "follow" ? ["follow"] : ["host"],
      source,
      createdAt: now,
      updatedAt: now,
    });
  };

  for (const f of opts.following) push(f, "follow");
  for (const h of opts.hosts ?? []) push(h, "host");

  if (added.length === 0) return store;
  return { version: 1, contacts: [...added, ...store.contacts] };
}

export function upsertContact(store: CrmStore, contact: CrmContact): CrmStore {
  const i = store.contacts.findIndex((c) => c.id === contact.id);
  const next = [...store.contacts];
  if (i >= 0) next[i] = { ...contact, updatedAt: nowIso() };
  else next.unshift({ ...contact, updatedAt: nowIso() });
  return { version: 1, contacts: next };
}

export function removeContact(store: CrmStore, id: string): CrmStore {
  return { version: 1, contacts: store.contacts.filter((c) => c.id !== id) };
}

export function addManualContact(
  store: CrmStore,
  opts: { name: string; notes?: string; status?: CrmStatus },
): CrmStore {
  const now = nowIso();
  const contact: CrmContact = {
    id: newContactId(),
    name: opts.name.trim(),
    avatar: null,
    lumaId: null,
    status: opts.status ?? "new",
    notes: opts.notes ?? "",
    nextAction: "",
    nextDue: null,
    lastTouch: null,
    tags: ["manual"],
    source: "manual",
    createdAt: now,
    updatedAt: now,
  };
  return { version: 1, contacts: [contact, ...store.contacts] };
}

export function pipelineCounts(contacts: CrmContact[]): Record<CrmStatus, number> {
  const counts = Object.fromEntries(CRM_STATUSES.map((s) => [s, 0])) as Record<CrmStatus, number>;
  for (const c of contacts) counts[c.status] += 1;
  return counts;
}

export type CrmSuggestion = {
  kind: "stale" | "due" | "convergence";
  contactId?: string;
  name: string;
  reason: string;
};

/** Pure suggestion engine for Veridian brief / dock. */
export function suggestActions(
  contacts: CrmContact[],
  opts?: {
    convergingHosts?: { id: string; name: string; eventName: string; overlap: number }[];
  },
): CrmSuggestion[] {
  const out: CrmSuggestion[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const c of contacts) {
    if (c.nextDue) {
      const due = new Date(c.nextDue + "T00:00:00");
      if (due <= today) {
        out.push({
          kind: "due",
          contactId: c.id,
          name: c.name,
          reason: c.nextAction
            ? `follow-up due: ${c.nextAction}`
            : `follow-up due ${c.nextDue}`,
        });
      }
    }
    if (c.lastTouch) {
      const last = new Date(c.lastTouch).getTime();
      const days = (Date.now() - last) / (1000 * 60 * 60 * 24);
      if (days >= 14 && (c.status === "met" || c.status === "follow_up" || c.status === "waiting")) {
        out.push({
          kind: "stale",
          contactId: c.id,
          name: c.name,
          reason: `no touch in ${Math.floor(days)} days — worth a check-in.`,
        });
      }
    } else if (c.status === "new" || c.status === "reach_out") {
      out.push({
        kind: "stale",
        contactId: c.id,
        name: c.name,
        reason: "never contacted — draft an opener before the week fills up.",
      });
    }
  }

  for (const h of opts?.convergingHosts ?? []) {
    out.push({
      kind: "convergence",
      name: h.name,
      reason: `${h.overlap} of your follows converge at ${h.eventName} — highest-signal intro.`,
    });
  }

  // Deduplicate by name+kind, cap
  const seen = new Set<string>();
  const unique: CrmSuggestion[] = [];
  for (const s of out) {
    const key = `${s.kind}:${s.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(s);
    if (unique.length >= 8) break;
  }
  return unique;
}

export function draftOpener(name: string, eventName?: string): string {
  const first = name.trim().split(/\s+/)[0] || name;
  if (eventName) {
    return `hey ${first} — I'll be at ${eventName}. would love to say hi before the room fills up.`;
  }
  return `hey ${first} — saw you have a busy week on luma. which one should I not miss?`;
}

export function exportCrmJson(store: CrmStore): string {
  return JSON.stringify(store, null, 2);
}

export function importCrmJson(raw: string): CrmStore {
  const parsed = JSON.parse(raw) as CrmStore;
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.contacts)) {
    throw new Error("invalid CRM export");
  }
  return parsed;
}

/** Match a calendar meeting title/attendees against CRM contact names. */
export function matchMeetingToContacts(
  contacts: CrmContact[],
  meetingTitle: string,
): CrmContact[] {
  const t = meetingTitle.toLowerCase();
  return contacts.filter((c) => {
    const n = c.name.trim().toLowerCase();
    if (!n) return false;
    const first = n.split(/\s+/)[0];
    return t.includes(n) || (first.length > 2 && t.includes(first));
  });
}

export function greetingForHour(hour = new Date().getHours()): string {
  if (hour < 12) return "good morning";
  if (hour < 17) return "good afternoon";
  return "good evening";
}
