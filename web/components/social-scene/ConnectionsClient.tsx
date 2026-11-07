"use client";

import { useEffect, useState } from "react";
import type { ProviderStatus } from "@/lib/providers/types";
import {
  ensureLocalProfile,
  loadSocialStore,
  saveSocialStore,
  upsertProfile,
  type SocialSceneStore,
} from "@/lib/social-scene";
import SocialLinksEditor from "./SocialLinksEditor";
import ProviderEventBrowser from "./ProviderEventBrowser";

type Props = {
  providers: ProviderStatus[];
  sceneQs: string;
};

export default function ConnectionsClient({ providers, sceneQs }: Props) {
  const [store, setStore] = useState<SocialSceneStore | null>(null);

  useEffect(() => {
    let s = loadSocialStore();
    const ensured = ensureLocalProfile(s);
    s = ensured.store;
    saveSocialStore(s);
    setStore(s);
  }, []);

  const profile = store?.localProfileId ? store.profiles[store.localProfileId] : null;
  const qs = sceneQs ? `?${sceneQs}` : "";

  if (!store || !profile) return <p className="sub">loading…</p>;

  return (
    <div className="ss-workspace">
      <div className="ss-subnav">
        <a href={`/social-scene${qs}`}>pond</a>
        <a href={`/social-scene/yours${qs}`}>your social scene</a>
        <a href={`/social-scene/connections${qs}`} className="on">
          connections
        </a>
      </div>

      <div className="ss-section-head">
        <h2>event providers</h2>
        <p className="sub">
          Luma powers your URL scene. Ticketmaster needs an API key; Eventbrite is org-scoped;
          Partiful accepts event URLs (optional bearer for your RSVPs).
        </p>
      </div>
      <div className="ss-grid">
        {providers.map((p) => (
          <div key={p.id} className="ss-card">
            <div className="ss-rec-kind">
              {p.mode} · {p.configured ? "ready" : "needs setup"}
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

      <h2 className="dash-section-title">try a provider search / URL</h2>
      <ProviderEventBrowser city={profile.cities[0]} />
      <p className="sub" style={{ marginTop: 8 }}>
        preview only here — open a community to attach provider events.
      </p>

      <h2 className="dash-section-title">social profiles</h2>
      <SocialLinksEditor
        links={profile.socialLinks ?? []}
        onChange={(socialLinks) => {
          const next = upsertProfile(store, { ...profile, socialLinks });
          saveSocialStore(next);
          setStore(next);
        }}
      />
    </div>
  );
}
