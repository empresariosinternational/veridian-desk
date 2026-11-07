/**
 * Committed demo seed. Everything here is fictional: Tidepath Family Alliance,
 * Mangrove Mews, every person, school and donor.
 *
 * The truth ledger is the only source of numbers for grant and quarterly text.
 */

import type { DeskState, LedgerEntry, Profile, ProfileId } from "./types";

const SEED_AT = "2026-11-07T12:00:00.000Z";

function ledger(entries: Omit<LedgerEntry, "updatedAt">[]): Record<string, LedgerEntry> {
  return Object.fromEntries(entries.map((e) => [e.id, { ...e, updatedAt: SEED_AT }]));
}

function profiles(list: Profile[]): Record<ProfileId, Profile> {
  return Object.fromEntries(list.map((p) => [p.id, p])) as Record<ProfileId, Profile>;
}

export function createSeedState(): DeskState {
  return {
    version: 1,
    seededAt: SEED_AT,
    orgs: {
      tidepath: {
        id: "tidepath",
        name: "Tidepath Family Alliance",
        kind: "Family nonprofit",
        area: "Little Havana and West Little River, Miami-Dade",
        languages: ["en", "es", "ht"],
        fictional: true,
      },
      mangrove: {
        id: "mangrove",
        name: "Mangrove Mews",
        kind: "Cat rescue",
        area: "Miami-Dade",
        languages: ["en", "es"],
        fictional: true,
      },
    },
    profiles: profiles([
      {
        id: "marisol",
        name: "Marisol",
        fullName: "Marisol",
        role: "Program manager",
        side: "B2B",
        orgId: "tidepath",
        boards: ["calls"],
        preferences: {},
      },
      {
        id: "denise",
        name: "Denise",
        fullName: "Denise",
        role: "Fundraising coordinator",
        side: "B2B",
        orgId: "tidepath",
        boards: ["donors"],
        preferences: {},
      },
      {
        id: "yesenia",
        name: "Yesenia",
        fullName: "Yesenia",
        role: "Front-desk coordinator",
        side: "B2B",
        orgId: "tidepath",
        boards: ["workshops"],
        preferences: {},
      },
      {
        id: "reginald",
        name: "Reginald",
        fullName: "Reginald",
        role: "Counselor",
        side: "B2B",
        orgId: "tidepath",
        boards: ["notes"],
        preferences: {},
      },
      {
        id: "owen",
        name: "Owen",
        fullName: "Owen",
        role: "Volunteer coordinator",
        side: "B2B",
        orgId: "tidepath",
        boards: ["staffing", "recruiting"],
        preferences: {},
      },
      {
        id: "claudette",
        name: "Claudette",
        fullName: "Claudette",
        role: "Director",
        side: "B2B",
        orgId: "tidepath",
        boards: ["grants"],
        preferences: {},
      },
      {
        id: "beatriz",
        name: "Beatriz",
        fullName: "Beatriz",
        role: "Founder, Mangrove Mews",
        side: "B2B",
        orgId: "mangrove",
        boards: ["colony", "network"],
        preferences: {},
      },
      {
        id: "ana",
        name: "Ana",
        fullName: "Ana Morales",
        role: "Volunteer",
        side: "B2C",
        boards: ["person"],
        preferences: {},
        offer: { roles: ["event helper"], areas: ["Little Havana"], languages: ["en", "es"], availability: ["weekdays"] },
      },
      {
        id: "luis",
        name: "Luis",
        fullName: "Luis Ortega",
        role: "Neighbor",
        side: "B2C",
        boards: ["person"],
        preferences: {},
        offer: { roles: ["driver"], areas: ["West Little River"], languages: ["es", "en"], availability: ["weekends"] },
      },
    ]),
    node: {
      status: "IDLE",
      line: "Veridian Desk",
      armedAt: null,
      statusAt: SEED_AT,
      urgent: false,
      urgentId: null,
      urgentLine: null,
      presenceUntil: null,
      log: [],
    },
    filed: {},
    feed: [],
    notes: [
      {
        id: "note-luis-offer",
        at: "2026-11-02T15:00:00.000Z",
        author: "luis",
        board: "person",
        dataClass: "OPERATIONAL",
        lang: "en",
        text: "I can drive on weekends in West Little River. I speak Spanish.",
        filedKey: "seed",
      },
    ],
    mentees: [
      {
        id: "jordan-alvarez",
        name: "Jordan Alvarez",
        area: "Little Havana",
        school: "Calle Ocho Elementary",
        guardian: "his mom",
      },
    ],
    calls: [
      {
        id: "call-jean-baptiste",
        who: "Jean-Baptiste household",
        about: "Workshop times after 5 PM",
        school: "Riverbend K-8",
        reason: "Asked for evening workshop times (staff summary, Creole)",
        dueBy: "2026-11-13",
        lang: "ht",
        status: "open",
        createdAt: SEED_AT,
        createdBy: "seed",
        entityKey: "call|jean-baptiste|workshop-times",
      },
    ],
    families: [
      {
        id: "fam-jean-baptiste",
        name: "Jean-Baptiste household",
        lang: "ht",
        school: "Riverbend K-8",
        summary: "Prefers Creole. Asked for workshop times after 5 PM. Staff will call this week.",
        enteredBy: "staff",
      },
    ],
    donors: [
      {
        id: "d-mg-1",
        name: "María González",
        email: "maria.gonzalez@example.com",
        source: "Gala tickets",
        gifts: [
          { id: "g-0917", date: "2025-11-20", amount: 50, via: "Give Miami Day 2025" },
          { id: "g-1043", date: "2026-03-03", amount: 50, via: "Online form" },
        ],
      },
      {
        id: "d-mg-2",
        name: "Maria Gonzalez",
        email: "Maria.Gonzalez@example.com",
        source: "Online donation form",
        gifts: [{ id: "g-1043", date: "2026-03-03", amount: 50, via: "Online form" }],
      },
      {
        id: "d-cr",
        name: "Carlos Rivera",
        email: "carlos.rivera@example.com",
        source: "Online donation form",
        gifts: [{ id: "g-1180", date: "2026-10-28", amount: 100 }],
      },
      {
        id: "d-rd",
        name: "Rosa Delgado",
        email: "rosa.delgado@example.com",
        source: "Gala tickets",
        gifts: [{ id: "g-0702", date: "2025-12-12", amount: 250 }],
      },
      {
        id: "d-np",
        name: "Nadège Pierre",
        email: "nadege.pierre@example.com",
        source: "Monthly giving",
        gifts: [
          { id: "g-1101", date: "2026-09-30", amount: 25 },
          { id: "g-1150", date: "2026-10-31", amount: 25 },
        ],
      },
      {
        id: "d-kt",
        name: "Kevin Tran",
        email: "kevin.tran@example.com",
        source: "Online donation form",
        gifts: [{ id: "g-0988", date: "2026-08-14", amount: 75 }],
      },
    ],
    workshops: [],
    hours: [],
    shifts: [],
    recruits: [],
    standingRoles: [
      { id: "role-mentor-es", orgId: "tidepath", title: "Spanish-speaking mentor", area: "Little Havana", lang: "Spanish", status: "open" },
      { id: "role-event-helper", orgId: "tidepath", title: "Give Miami Day event helper", area: "Little Havana", lang: "Any", status: "open" },
    ],
    colonies: [
      {
        id: "colony-a",
        orgId: "mangrove",
        name: "Colony A",
        area: "El Portal",
        status: "Fed",
        need: null,
        updatedAt: "2026-11-06T13:00:00.000Z",
        updatedBy: "beatriz",
        matchedWith: null,
        dataClass: "PUBLIC_COMMUNITY",
      },
      {
        id: "colony-b",
        orgId: "mangrove",
        name: "Colony B",
        area: "West Little River",
        status: "Unknown",
        need: null,
        updatedAt: null,
        updatedBy: null,
        matchedWith: null,
        dataClass: "PUBLIC_COMMUNITY",
      },
    ],
    needs: [],
    matches: [],
    ledger: ledger([
      { id: "grant-county-awarded", label: "County youth safety grant — awarded", value: 120000, unit: "usd", source: "Award letter (seed)" },
      { id: "grant-county-spent", label: "County youth safety grant — spent to date, workshops and mentoring", value: 80000, unit: "usd", source: "Books (seed)" },
      { id: "q3-mentoring-sessions", label: "Mentoring sessions, Q3 (Jul–Sep)", value: 42, unit: "count", source: "Program sheet (seed)" },
      { id: "q3-workshops", label: "Safety and mental health workshops, Q3 (Jul–Sep)", value: 6, unit: "count", source: "Program sheet (seed)" },
      { id: "q4-missed-session-followups", label: "Missed-session follow-up calls opened, this quarter", value: 0, unit: "count", source: "Veridian Desk" },
      { id: "q4-counseling-sessions", label: "School-based counseling sessions completed, this quarter (filed on the desk)", value: 0, unit: "count", source: "Veridian Desk" },
    ]),
    grants: [
      {
        id: "grant-county",
        name: "County youth safety grant",
        funder: "County youth safety fund (fictional)",
        awardLedgerId: "grant-county-awarded",
        spentLedgerId: "grant-county-spent",
        rule: "Workshops and mentoring only. No food. No fundraising gala.",
        disallowed: ["food", "meal", "snack", "gala", "fundraising"],
      },
    ],
    drafts: [],
    voiceGuide: {
      rules: [
        "Short sentences.",
        "No jargon.",
        "Spanish and English are both welcome.",
        "Never claim an outcome the ledger does not contain.",
      ],
      samples: [
        "We help Miami-Dade kids and their families stay safe, in school and supported.",
        "Cuando un niño falta a su mentoría, llamamos a su familia esa misma semana.",
      ],
    },
  };
}
