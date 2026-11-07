"use client";

import { useCallback, useEffect, useState } from "react";
import type { Digest } from "@/lib/luma";
import type { ProviderStatus } from "@/lib/providers/types";
import {
  type SocialSceneStore,
  ensureLocalProfile,
  loadSocialStore,
  saveSocialStore,
  seedPondIfNeeded,
  upsertProfile,
} from "@/lib/social-scene";
import SocialLinksEditor from "@/components/social-scene/SocialLinksEditor";
import VeridianMark from "@/components/VeridianMark";

type Props = {
  digest: Digest | null;
  sceneQs: string;
  providers: ProviderStatus[];
};

export default function ProfileHub({ digest, sceneQs, providers }: Props) {
  const [store, setStore] = useState<SocialSceneStore | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const persist = useCallback((next: SocialSceneStore) => {
    setStore(next);
    saveSocialStore(next);
  }, []);

  useEffect(() => {
    let s = loadSocialStore();
    s = seedPondIfNeeded(s, digest?.cities ?? []);
    const ensured = ensureLocalProfile(s, digest?.cities ?? []);
    s = ensured.store;
    setDisplayName(ensured.profile.displayName);
    setBio(ensured.profile.bio);
    persist(s);
  }, [digest, persist]);

  const profile = store?.localProfileId ? store.profiles[store.localProfileId] : null;
  const qs = sceneQs ? `?${sceneQs}` : "";

  if (!store || !profile) return <p className="sub">loading profile…</p>;

  const communities = profile.communityIds
    .map((id) => store.communities[id])
    .filter(Boolean);
  const socialCount = profile.socialLinks?.length ?? 0;
  const readyProviders = providers.filter((p) => p.configured).length;

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2000);
  };

  const save = () => {
    persist(
      upsertProfile(store, {
        ...profile,
        displayName: displayName.trim() || profile.displayName,
        bio: bio.trim() || profile.bio,
      }),
    );
    flash("profile saved");
  };

  return (
    <div className="profile-hub">
      {toast && <div className="crm-toast">{toast}</div>}

      <section className="profile-hero-card">
        <div className="profile-hero-avatar" aria-hidden>
          {profile.displayName.trim().charAt(0).toUpperCase()}
        </div>
        <div className="profile-hero-meta">
          <div className="eyebrow">your hub · on-device</div>
          <h1>{profile.displayName}</h1>
          <p className="sub">
            @{profile.handle} · {socialCount} social · {communities.length} communities ·{" "}
            {profile.offerings.length} offerings
          </p>
        </div>
        <div className="profile-hero-veridian">
          <VeridianMark size={18} />
          <span>veridian</span>
        </div>
      </section>

      <section className="profile-quick">
        <h2>go to</h2>
        <div className="profile-quick-grid">
          {(
            [
              ["your social scene", `/social-scene/yours${qs}`, "curate communities & events"],
              ["connections", `/social-scene/connections${qs}`, "Ticketmaster · Eventbrite · Partiful · social"],
              ["the pond", `/social-scene${qs}`, "marketplace discovery"],
              ["agent matches", `/social-scene/matches${qs}`, "intros & capability cards"],
              ["agents", `/social-scene/agents${qs}`, "autonomy · audit"],
              ["CRM", `/crm${qs}`, "pipeline & follow-ups"],
            ] as const
          ).map(([label, href, hint]) => (
            <a key={href} className="profile-quick-card" href={href}>
              <strong>{label}</strong>
              <span>{hint}</span>
            </a>
          ))}
        </div>
      </section>

      <section className="profile-section">
        <h2>identity</h2>
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
          <button type="button" className="crm-btn" onClick={save}>
            save
          </button>
        </div>
      </section>

      <section className="profile-section">
        <h2>social profiles</h2>
        <p className="sub">
          Instagram, X, Facebook, Spotify, LinkedIn — packed into your agent capability card.
        </p>
        <SocialLinksEditor
          links={profile.socialLinks ?? []}
          onChange={(socialLinks) => persist(upsertProfile(store, { ...profile, socialLinks }))}
        />
      </section>

      <section className="profile-section">
        <h2>event apps</h2>
        <p className="sub">
          {readyProviders}/{providers.length} providers ready. Add API keys in Vercel env for live search.
        </p>
        <div className="ss-grid">
          {providers.map((p) => (
            <div key={p.id} className="ss-card">
              <div className="ss-rec-kind">
                {p.configured ? "ready" : "setup"} · {p.mode}
              </div>
              <h3 className="ss-card-title">{p.label}</h3>
              <p className="ss-card-tag">{p.blurb}</p>
              {p.envHint && (
                <div className="ss-card-meta">
                  <code>{p.envHint}</code>
                </div>
              )}
            </div>
          ))}
        </div>
        <a className="crm-btn" href={`/social-scene/connections${qs}`} style={{ marginTop: 12 }}>
          open connections →
        </a>
      </section>

      <section className="profile-section">
        <h2>your communities</h2>
        {communities.length === 0 ? (
          <p className="sub">
            none yet —{" "}
            <a className="inline-link" href={`/social-scene/yours${qs}`}>
              create one in your social scene
            </a>
            .
          </p>
        ) : (
          <div className="ss-grid">
            {communities.map((c) => (
              <a
                key={c!.id}
                className="ss-card"
                href={`/social-scene/c/${c!.id}${qs}`}
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
        )}
      </section>
    </div>
  );
}
