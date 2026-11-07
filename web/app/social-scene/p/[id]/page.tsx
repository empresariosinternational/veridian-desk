"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import type { SocialProfile, SocialSceneStore } from "@/lib/social-scene";
import {
  appendProposal,
  capabilityCardFromProfile,
  categoryLabel,
  createProposal,
  loadSocialStore,
  logAgentAction,
  resolveProposal,
  saveSocialStore,
  simulatePeerAgentReply,
} from "@/lib/social-scene";
import FadeIn from "@/components/motion/FadeIn";

export default function SocialProfilePage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [store, setStore] = useState<SocialSceneStore | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setStore(loadSocialStore());
  }, []);

  const profile: SocialProfile | null = store?.profiles[params.id] ?? null;
  const me = store?.localProfileId ? store.profiles[store.localProfileId] : null;
  const qs = searchParams.toString();
  const back = qs ? `/social-scene?${qs}` : "/social-scene";

  const propose = () => {
    if (!store || !profile || !me || me.id === profile.id) return;
    const proposal = createProposal({
      kind: "PROPOSE_INTRO",
      fromProfileId: me.id,
      toProfileId: profile.id,
      fromAgentRef: me.agents[0]?.agentRef ?? "veridian",
      message: `intro: ${me.displayName} would like to connect with ${profile.displayName} via Social Scene.`,
      capabilityCard: capabilityCardFromProfile(me),
    });
    let next = appendProposal(store, proposal);
    const reply = simulatePeerAgentReply(proposal, profile);
    if (reply?.kind === "ACCEPT") next = resolveProposal(next, proposal.id, "accepted");
    if (reply?.kind === "DECLINE") next = resolveProposal(next, proposal.id, "declined");
    next = logAgentAction(next, {
      agentRef: "veridian",
      action: "propose_match",
      detail: `profile page → ${profile.displayName}`,
      autonomy: me.agents[0]?.autonomy ?? "draft",
    });
    saveSocialStore(next);
    setStore(next);
    setToast(reply?.kind === "ACCEPT" ? "agent accepted" : reply?.kind === "DECLINE" ? "agent declined" : "sent");
    window.setTimeout(() => setToast(null), 2000);
  };

  if (!store) return <p className="sub">loading…</p>;

  if (!profile) {
    return (
      <FadeIn>
        <a href={back} className="back">
          ← social scene
        </a>
        <p className="sub">profile not found on this device.</p>
      </FadeIn>
    );
  }

  const owned = profile.communityIds
    .map((id) => store.communities[id])
    .filter(Boolean);

  return (
    <FadeIn>
      <a href={back} className="back">
        ← social scene
      </a>
      {toast && <div className="crm-toast">{toast}</div>}
      <div className="eyebrow">profile · @{profile.handle}</div>
      <h1>{profile.displayName}</h1>
      <p className="sub" style={{ marginTop: 8 }}>
        {profile.bio}
      </p>
      <div className="ss-card-meta" style={{ marginTop: 10 }}>
        {profile.cities.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      {(profile.socialLinks?.length ?? 0) > 0 && (
        <div className="ss-chips" style={{ marginTop: 12 }}>
          {profile.socialLinks.map((l) => (
            <a key={l.network} className="ss-chip" href={l.url} target="_blank" rel="noopener noreferrer">
              {l.network} · @{l.handle}
            </a>
          ))}
        </div>
      )}
      {me && me.id !== profile.id && (
        <button type="button" className="crm-btn" style={{ marginTop: 14 }} onClick={propose}>
          ask Veridian to intro
        </button>
      )}

      {profile.offerings.length > 0 && (
        <>
          <h2 className="dash-section-title">offerings</h2>
          <div className="ss-grid">
            {profile.offerings.map((o) => (
              <div key={o.id} className="ss-card">
                <div className="ss-rec-kind">{categoryLabel(o.category)}</div>
                <h3 className="ss-card-title">{o.title}</h3>
                <p className="ss-card-tag">{o.summary}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="dash-section-title">communities</h2>
      <div className="ss-grid">
        {owned.length === 0 && <p className="sub">no public communities on this profile yet.</p>}
        {owned.map((c) => (
          <a
            key={c!.id}
            className="ss-card"
            href={`/social-scene/c/${c!.id}${qs ? `?${qs}` : ""}`}
          >
            <h3 className="ss-card-title">{c!.name}</h3>
            <p className="ss-card-tag">{c!.tagline}</p>
            <div className="ss-card-meta">
              <span>{c!.eventRefs.length} events</span>
              <span>heat {Math.round(c!.heat)}</span>
            </div>
          </a>
        ))}
      </div>
    </FadeIn>
  );
}
