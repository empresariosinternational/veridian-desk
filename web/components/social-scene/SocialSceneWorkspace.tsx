"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Digest } from "@/lib/luma";
import {
  loadCrm,
  type CrmContact,
  newContactId,
  nowIso,
  saveCrm,
  upsertContact,
} from "@/lib/crm";
import {
  type AutonomyLevel,
  type Community,
  type OfferingCategory,
  type SocialSceneStore,
  OFFERING_CATEGORIES,
  addOffering,
  appendProposal,
  buildRecommendations,
  capabilityCardFromProfile,
  createProposal,
  deleteCommunity,
  draftPondIntros,
  ensureLocalProfile,
  exportSocialJson,
  listPublicCommunities,
  loadSocialStore,
  logAgentAction,
  newId,
  removeOffering,
  resolveProposal,
  saveSocialStore,
  seedPondIfNeeded,
  setAgentAutonomy,
  setRecommendations,
  simulatePeerAgentReply,
  tryConsumeAgentBudget,
  upsertCommunity,
  upsertProfile,
} from "@/lib/social-scene";
import CommunityCard from "./CommunityCard";
import RecommendationRail from "./RecommendationRail";
import AutonomyControls from "./AutonomyControls";
import SocialLinksEditor from "./SocialLinksEditor";

type Props = {
  digest: Digest | null;
  sceneQs: string;
  mode: "pond" | "yours" | "matches" | "agents";
};

export default function SocialSceneWorkspace({ digest, sceneQs, mode }: Props) {
  const [store, setStore] = useState<SocialSceneStore | null>(null);
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [cat, setCat] = useState<OfferingCategory>("other_legal");
  const [toast, setToast] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<OfferingCategory | "all">("all");
  const [offTitle, setOffTitle] = useState("");
  const [offSummary, setOffSummary] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [peerId, setPeerId] = useState("");

  const persist = useCallback((next: SocialSceneStore) => {
    setStore(next);
    saveSocialStore(next);
  }, []);

  const refreshRecs = useCallback(
    (s: SocialSceneStore, profileId: string | null) => {
      const profile = profileId ? s.profiles[profileId] : null;
      const crm = loadCrm().contacts;
      return setRecommendations(
        s,
        buildRecommendations({ store: s, profile, digest, crm, sceneQs }),
      );
    },
    [digest, sceneQs],
  );

  useEffect(() => {
    let s = loadSocialStore();
    const cities = digest?.cities ?? [];
    s = seedPondIfNeeded(s, cities);
    const ensured = ensureLocalProfile(s, cities);
    s = ensured.store;
    s = refreshRecs(s, ensured.profile.id);
    setDisplayName(ensured.profile.displayName);
    setBio(ensured.profile.bio);
    persist(s);
  }, [digest, persist, refreshRecs]);

  const profile = store?.localProfileId ? store.profiles[store.localProfileId] : null;
  const communities = useMemo(() => {
    if (!store) return [];
    let list = listPublicCommunities(store);
    if (filterCat !== "all") list = list.filter((c) => c.categories.includes(filterCat));
    return list;
  }, [store, filterCat]);

  const mine = useMemo(() => {
    if (!store || !profile) return [];
    return profile.communityIds
      .map((id) => store.communities[id])
      .filter(Boolean) as Community[];
  }, [store, profile]);

  const pondProfiles = useMemo(() => {
    if (!store || !profile) return [];
    return Object.values(store.profiles).filter(
      (p) => p.id !== profile.id && p.visibility === "public",
    );
  }, [store, profile]);

  const qs = sceneQs ? `?${sceneQs}` : "";
  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2200);
  };

  const createCommunity = () => {
    if (!store || !profile || !name.trim()) return;
    const now = new Date().toISOString();
    const community: Community = {
      id: newId("com"),
      ownerProfileId: profile.id,
      name: name.trim(),
      tagline: tagline.trim() || "a community in the pond",
      description: "",
      city: digest?.cities[0] ?? profile.cities[0] ?? null,
      categories: [cat],
      eventRefs: [],
      visibility: "public",
      heat: 12,
      followerIds: [],
      createdAt: now,
      updatedAt: now,
    };
    let next = upsertCommunity(store, community);
    next = logAgentAction(next, {
      agentRef: "veridian",
      action: "create_community",
      detail: community.name,
      autonomy: profile.agents[0]?.autonomy ?? "draft",
    });
    next = refreshRecs(next, profile.id);
    persist(next);
    setName("");
    setTagline("");
    flash("community created — open it to attach events");
  };

  const saveProfile = () => {
    if (!store || !profile) return;
    persist(
      upsertProfile(store, {
        ...profile,
        displayName: displayName.trim() || profile.displayName,
        bio: bio.trim() || profile.bio,
      }),
    );
    flash("profile saved");
  };

  const setAutonomy = (autonomy: AutonomyLevel) => {
    if (!store || !profile) return;
    let next = setAgentAutonomy(store, profile.id, autonomy);
    next = logAgentAction(next, {
      agentRef: "veridian",
      action: "set_autonomy",
      detail: autonomy,
      autonomy,
    });
    persist(next);
  };

  const proposeTo = (toProfileId: string) => {
    if (!store || !profile) return;
    const peer = store.profiles[toProfileId];
    if (!peer) return;
    const autonomy = profile.agents[0]?.autonomy ?? "draft";
    if (autonomy === "suggest") {
      flash("raise autonomy to draft+ to send agent intros");
      return;
    }
    const budget = tryConsumeAgentBudget(store, profile.id, "veridian");
    if (!budget.allowed) {
      flash(budget.reason || "budget blocked");
      return;
    }
    let next = budget.store;
    const proposal = createProposal({
      kind: "PROPOSE_COLLAB",
      fromProfileId: profile.id,
      toProfileId,
      fromAgentRef: profile.agents[0]?.agentRef ?? "veridian",
      message: `collab intro: ${profile.displayName} × ${peer.displayName} — communities and categories may align.`,
      capabilityCard: capabilityCardFromProfile(profile),
    });
    next = appendProposal(next, proposal);
    const reply = simulatePeerAgentReply(proposal, peer);
    if (reply?.kind === "ACCEPT") {
      next = resolveProposal(next, proposal.id, "accepted");
      flash(`agent accepted — ${peer.displayName}`);
    } else if (reply?.kind === "DECLINE") {
      next = resolveProposal(next, proposal.id, "declined");
      flash(`agent declined — ${peer.displayName}`);
    } else {
      flash("proposal sent");
    }
    next = logAgentAction(next, {
      agentRef: "veridian",
      action: "propose_match",
      detail: `${proposal.kind} → ${peer.displayName} · ${reply?.kind ?? "pending"}`,
      autonomy: profile.agents[0]?.autonomy ?? "draft",
    });
    persist(next);
  };

  const runVeridianDrafts = () => {
    if (!store || !profile) return;
    if ((profile.agents[0]?.autonomy ?? "draft") === "suggest") {
      flash("raise autonomy to draft to send proposals");
      return;
    }
    const drafts = draftPondIntros(store, profile, 3);
    let next = store;
    for (const p of drafts) {
      // skip duplicates pending
      if (next.matches.some((m) => m.toProfileId === p.toProfileId && m.status === "pending")) continue;
      next = appendProposal(next, p);
      const peer = next.profiles[p.toProfileId];
      const reply = simulatePeerAgentReply(p, peer);
      if (reply?.kind === "ACCEPT") next = resolveProposal(next, p.id, "accepted");
      if (reply?.kind === "DECLINE") next = resolveProposal(next, p.id, "declined");
    }
    next = logAgentAction(next, {
      agentRef: "veridian",
      action: "batch_draft_intros",
      detail: `${drafts.length} pond intros`,
      autonomy: profile.agents[0]?.autonomy ?? "draft",
    });
    next = refreshRecs(next, profile.id);
    persist(next);
    flash(`Veridian drafted ${drafts.length} agent intros`);
  };

  const addOff = () => {
    if (!store || !profile || !offTitle.trim()) return;
    const next = addOffering(store, profile.id, {
      id: newId("off"),
      title: offTitle.trim(),
      summary: offSummary.trim() || "legal business / community offering",
      category: cat,
      city: digest?.cities[0] ?? null,
      url: null,
      legalAttested: true,
      visibility: "public",
    });
    persist(refreshRecs(next, profile.id));
    setOffTitle("");
    setOffSummary("");
    flash("offering listed in the pond");
  };

  const onAddToCrm = (title: string) => {
    const crmStore = loadCrm();
    const contact: CrmContact = {
      id: newContactId(),
      name: title,
      avatar: null,
      lumaId: null,
      status: "reach_out",
      notes: "from Social Scene Veridian recommendation",
      nextAction: "send opener",
      nextDue: null,
      lastTouch: null,
      tags: ["social-scene", "veridian"],
      source: "manual",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    saveCrm(upsertContact(crmStore, contact));
    flash("added to CRM");
  };

  const onExport = () => {
    if (!store) return;
    const blob = new Blob([exportSocialJson(store)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `social-scene-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!store || !profile) {
    return <p className="sub">loading social scene…</p>;
  }

  const primaryAgent = profile.agents[0];

  return (
    <div className="ss-workspace">
      {toast && <div className="crm-toast">{toast}</div>}

      <div className="ss-subnav">
        {(
          [
            ["pond", "pond", `/social-scene${qs}`],
            ["yours", "your social scene", `/social-scene/yours${qs}`],
            ["matches", "matches", `/social-scene/matches${qs}`],
            ["agents", "agents", `/social-scene/agents${qs}`],
            ["connections", "connections", `/social-scene/connections${qs}`],
          ] as const
        ).map(([key, label, href]) => (
          <a
            key={key}
            href={href}
            className={mode === key ? "on" : undefined}
          >
            {label}
          </a>
        ))}
      </div>

      {(mode === "pond" || mode === "yours") && (
        <RecommendationRail
          items={store.recommendations}
          onAddToCrm={(r) => onAddToCrm(r.title)}
        />
      )}

      {mode === "pond" && (
        <>
          <div className="ss-section-head">
            <h2>the pond</h2>
            <p className="sub">
              open network marketplace — coffee shops to F500. follow communities, let agents propose collabs.
            </p>
          </div>
          <div className="ss-cat-row">
            <button
              type="button"
              className={`ss-chip-btn${filterCat === "all" ? " on" : ""}`}
              onClick={() => setFilterCat("all")}
            >
              all
            </button>
            {OFFERING_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`ss-chip-btn${filterCat === c.id ? " on" : ""}`}
                title={c.blurb}
                onClick={() => setFilterCat(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="ss-grid">
            {communities.map((c) => (
              <CommunityCard key={c.id} community={c} href={`/social-scene/c/${c.id}${qs}`} />
            ))}
          </div>
          <h2 className="dash-section-title">profiles in the pond</h2>
          <div className="ss-grid">
            {pondProfiles.map((p) => (
              <a key={p.id} className="ss-card" href={`/social-scene/p/${p.id}${qs}`}>
                <div className="ss-rec-kind">@{p.handle}</div>
                <h3 className="ss-card-title">{p.displayName}</h3>
                <p className="ss-card-tag">{p.bio}</p>
                <div className="ss-card-meta">
                  <span>{p.offerings.length} offerings</span>
                  <span>{p.communityIds.length} communities</span>
                </div>
                <button
                  type="button"
                  className="crm-btn"
                  style={{ marginTop: 10 }}
                  onClick={(e) => {
                    e.preventDefault();
                    proposeTo(p.id);
                  }}
                >
                  agent intro
                </button>
              </a>
            ))}
          </div>
        </>
      )}

      {mode === "yours" && (
        <>
          <div className="ss-section-head">
            <h2>your social scene</h2>
            <p className="sub">
              curate communities from events you host or attend. open a community to attach from your Luma scene.
            </p>
          </div>

          <div className="ss-profile-edit">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="display name"
              aria-label="display name"
            />
            <input
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="bio"
              aria-label="bio"
            />
            <button type="button" className="crm-btn" onClick={saveProfile}>
              save profile
            </button>
          </div>

          <div className="ss-create">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="community name"
              aria-label="community name"
            />
            <input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="tagline"
              aria-label="tagline"
            />
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value as OfferingCategory)}
              aria-label="category"
            >
              {OFFERING_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <button type="button" className="crm-btn" onClick={createCommunity}>
              create
            </button>
          </div>

          <div className="ss-grid">
            {mine.length === 0 && (
              <p className="sub">no communities yet — create one, then attach hosting/attending events.</p>
            )}
            {mine.map((c) => (
              <div key={c.id} className="ss-card-wrap">
                <CommunityCard community={c} href={`/social-scene/c/${c.id}${qs}`} />
                <button
                  type="button"
                  className="veridian-action"
                  onClick={() => {
                    persist(refreshRecs(deleteCommunity(store, c.id), profile.id));
                    flash("community deleted");
                  }}
                >
                  delete
                </button>
              </div>
            ))}
          </div>

          <h2 className="dash-section-title">social profiles</h2>
          <SocialLinksEditor
            links={profile.socialLinks ?? []}
            onChange={(socialLinks) => {
              persist(refreshRecs(upsertProfile(store, { ...profile, socialLinks }), profile.id));
            }}
          />

          <h2 className="dash-section-title">showcase offering</h2>
          <p className="sub">any legal business — coffee shop to enterprise. you attest legality.</p>
          <div className="ss-create">
            <input
              value={offTitle}
              onChange={(e) => setOffTitle(e.target.value)}
              placeholder="offering title"
            />
            <input
              value={offSummary}
              onChange={(e) => setOffSummary(e.target.value)}
              placeholder="short summary"
            />
            <select value={cat} onChange={(e) => setCat(e.target.value as OfferingCategory)}>
              {OFFERING_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <button type="button" className="crm-btn" onClick={addOff}>
              list offering
            </button>
          </div>
          <ul className="ss-match-list">
            {profile.offerings.map((o) => (
              <li key={o.id} className="ss-match-item">
                <div className="ss-rec-kind">{o.category} · attested</div>
                <div className="ss-rec-title">{o.title}</div>
                <div className="ss-rec-reason">{o.summary}</div>
                <button
                  type="button"
                  className="veridian-action"
                  onClick={() => persist(removeOffering(store, profile.id, o.id))}
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {mode === "matches" && (
        <>
          <div className="ss-section-head">
            <h2>agent matches</h2>
            <p className="sub">
              structured agent-to-agent proposals with capability cards. dual consent before intros land.
            </p>
          </div>
          <div className="ss-match-actions">
            <button type="button" className="crm-btn" onClick={runVeridianDrafts}>
              Veridian: draft pond intros
            </button>
            <select
              value={peerId}
              onChange={(e) => setPeerId(e.target.value)}
              aria-label="choose peer"
            >
              <option value="">choose a profile…</option>
              {pondProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="crm-btn ghost"
              disabled={!peerId}
              onClick={() => peerId && proposeTo(peerId)}
            >
              send agent intro
            </button>
          </div>
          <ul className="ss-match-list">
            {store.matches.length === 0 && (
              <li className="sub">no proposals yet — draft pond intros or pick a profile.</li>
            )}
            {store.matches.map((m) => {
              const otherId = m.fromProfileId === profile.id ? m.toProfileId : m.fromProfileId;
              const other = store.profiles[otherId];
              return (
                <li key={m.id} className="ss-match-item">
                  <div className="ss-rec-kind">
                    {m.kind} · {m.status}
                  </div>
                  <div className="ss-rec-title">
                    {m.fromProfileId === profile.id ? "you → " : "peer → you · "}
                    {other?.displayName ?? otherId}
                  </div>
                  <div className="ss-rec-reason">{m.payload.message}</div>
                  {m.payload.capabilityCard && (
                    <div className="ss-cap-card">
                      <strong>capability card</strong>
                      <span>looking: {m.payload.capabilityCard.lookingFor.join(", ") || "—"}</span>
                      <span>offering: {m.payload.capabilityCard.offering.join(", ") || "—"}</span>
                      <span>
                        social:{" "}
                        {(m.payload.capabilityCard.social ?? []).join(", ") || "—"}
                      </span>
                    </div>
                  )}
                  {m.status === "pending" && m.toProfileId === profile.id && (
                    <div className="veridian-actions">
                      <button
                        type="button"
                        className="veridian-action"
                        onClick={() => {
                          persist(
                            logAgentAction(resolveProposal(store, m.id, "accepted"), {
                              agentRef: "veridian",
                              action: "accept_match",
                              detail: m.id,
                              autonomy: primaryAgent?.autonomy ?? "draft",
                            }),
                          );
                          flash("accepted — mutual consent");
                        }}
                      >
                        accept
                      </button>
                      <button
                        type="button"
                        className="veridian-action"
                        onClick={() => persist(resolveProposal(store, m.id, "declined"))}
                      >
                        decline
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {mode === "agents" && primaryAgent && (
        <>
          <div className="ss-section-head">
            <h2>agent sandbox</h2>
            <p className="sub">
              Veridian OS + MCP tool surface for your goals. autonomy never bypasses dual consent on intros.
            </p>
          </div>
          <AutonomyControls agent={primaryAgent} onChange={setAutonomy} />
          <p className="sub">
            budget today: {primaryAgent.actionsToday}/{primaryAgent.maxActionsPerDay} (supervised/autonomous)
          </p>
          <ul className="ss-agent-list">
            {profile.agents.map((a) => (
              <li key={a.id} className="ss-card">
                <h3 className="ss-card-title">{a.label}</h3>
                <p className="ss-card-tag">{a.agentRef}</p>
                <div className="ss-card-meta">
                  <span>{a.autonomy}</span>
                  <span>{a.enabled ? "on" : "off"}</span>
                </div>
                <div className="ss-chips">
                  {a.mcpServerIds.map((s) => (
                    <span key={s} className="ss-chip">
                      {s}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <div className="ss-section-head" style={{ marginTop: 24 }}>
            <h3>goals</h3>
          </div>
          <ul className="ss-match-list">
            {profile.goals.map((g) => (
              <li key={g.id} className="ss-match-item">
                <div className="ss-rec-kind">{g.kind}</div>
                <div className="ss-rec-title">{g.statement}</div>
              </li>
            ))}
          </ul>
          <div className="ss-section-head">
            <h3>audit log</h3>
          </div>
          <ul className="ss-match-list">
            {store.auditLog.length === 0 && <li className="sub">no agent actions yet.</li>}
            {store.auditLog.slice(0, 20).map((l) => (
              <li key={l.id} className="ss-match-item">
                <div className="ss-rec-kind">
                  {l.action} · {l.autonomy}
                </div>
                <div className="ss-rec-title">{l.detail}</div>
                <div className="ss-rec-reason">{new Date(l.at).toLocaleString()}</div>
              </li>
            ))}
          </ul>
          <button type="button" className="crm-btn ghost" onClick={onExport} style={{ marginTop: 12 }}>
            export social scene JSON
          </button>
        </>
      )}
    </div>
  );
}
