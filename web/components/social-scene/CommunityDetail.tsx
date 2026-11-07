"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Digest, EventRow } from "@/lib/luma";
import {
  type Community,
  type EventRole,
  type SocialSceneStore,
  type Visibility,
  attachEventToCommunity,
  categoryLabel,
  detachEventFromCommunity,
  digestEventPool,
  eventRowToRef,
  followCommunity,
  loadSocialStore,
  logAgentAction,
  saveSocialStore,
  unfollowCommunity,
  upsertCommunity,
} from "@/lib/social-scene";
import EventAttachPanel from "./EventAttachPanel";
import ProviderEventBrowser from "./ProviderEventBrowser";
import FadeIn from "@/components/motion/FadeIn";
import type { SceneEventRef } from "@/lib/social-scene/types";

type Props = {
  communityId: string;
  digest: Digest | null;
  sceneQs: string;
};

export default function CommunityDetail({ communityId, digest, sceneQs }: Props) {
  const [store, setStore] = useState<SocialSceneStore | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const persist = useCallback((next: SocialSceneStore) => {
    setStore(next);
    saveSocialStore(next);
  }, []);

  useEffect(() => {
    persist(loadSocialStore());
  }, [persist]);

  const community = store?.communities[communityId] ?? null;
  const profileId = store?.localProfileId;
  const isOwner = Boolean(community && profileId && community.ownerProfileId === profileId);
  const following = Boolean(
    profileId && store?.profiles[profileId]?.followedCommunityIds.includes(communityId),
  );

  const events = useMemo(() => (digest ? digestEventPool(digest) : []), [digest]);
  const attachedIds = useMemo(() => {
    const s = new Set<string>();
    for (const e of community?.eventRefs ?? []) s.add(`${e.eventId}:${e.role}`);
    return s;
  }, [community]);

  const qs = sceneQs ? `?${sceneQs}` : "";
  const back = `/social-scene${qs}`;
  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2000);
  };

  const onAttach = (event: EventRow, role: EventRole, visibility: Visibility) => {
    if (!store || !community) return;
    const ref = eventRowToRef(event, role, visibility);
    let next = attachEventToCommunity(store, community.id, ref);
    next = logAgentAction(next, {
      agentRef: "veridian",
      action: "attach_event",
      detail: `${role} · ${event.name} → ${community.name}`,
      autonomy: "draft",
    });
    persist(next);
    flash(`attached as ${role}`);
  };

  const onDetach = (refId: string) => {
    if (!store) return;
    persist(detachEventFromCommunity(store, communityId, refId));
    flash("removed");
  };

  const toggleFollow = () => {
    if (!store || !profileId) return;
    const next = following
      ? unfollowCommunity(store, profileId, communityId)
      : followCommunity(store, profileId, communityId);
    persist(
      logAgentAction(next, {
        agentRef: "veridian",
        action: following ? "unfollow_community" : "follow_community",
        detail: community?.name ?? communityId,
        autonomy: "draft",
      }),
    );
    flash(following ? "unfollowed" : "following");
  };

  const setVisibility = (visibility: Visibility) => {
    if (!store || !community || !isOwner) return;
    persist(upsertCommunity(store, { ...community, visibility }));
  };

  if (!store) return <p className="sub">loading…</p>;

  if (!community) {
    return (
      <FadeIn>
        <a href={back} className="back">
          ← social scene
        </a>
        <p className="sub">community not found on this device.</p>
      </FadeIn>
    );
  }

  const owner = store.profiles[community.ownerProfileId];

  return (
    <FadeIn>
      <a href={back} className="back">
        ← social scene
      </a>
      {toast && <div className="crm-toast">{toast}</div>}
      <div className="eyebrow">
        community · {community.visibility} · heat {Math.round(community.heat)}
      </div>
      <h1>{community.name}</h1>
      <p className="sub" style={{ marginTop: 8 }}>
        {community.tagline}
      </p>
      <div className="ss-card-meta" style={{ marginTop: 12 }}>
        {community.city && <span>{community.city}</span>}
        <span>{community.eventRefs.length} events</span>
        <span>{community.followerIds.length} following</span>
        {owner && (
          <a className="inline-link" href={`/social-scene/p/${owner.id}${qs}`}>
            @{owner.handle}
          </a>
        )}
      </div>
      <div className="ss-chips" style={{ marginTop: 12 }}>
        {community.categories.map((c) => (
          <span key={c} className="ss-chip">
            {categoryLabel(c)}
          </span>
        ))}
      </div>

      <div className="veridian-actions" style={{ marginTop: 14 }}>
        {!isOwner && profileId && (
          <button type="button" className="veridian-action" onClick={toggleFollow}>
            {following ? "unfollow" : "follow community"}
          </button>
        )}
        {isOwner && (
          <>
            {(["public", "unlisted", "private"] as Visibility[]).map((v) => (
              <button
                key={v}
                type="button"
                className={`veridian-action${community.visibility === v ? "" : ""}`}
                onClick={() => setVisibility(v)}
                style={
                  community.visibility === v
                    ? { background: "var(--veridian-soft)" }
                    : undefined
                }
              >
                {v}
              </button>
            ))}
          </>
        )}
      </div>

      <h2 className="dash-section-title">curated events</h2>
      {community.eventRefs.length === 0 ? (
        <p className="sub">no events yet — attach from your scene below.</p>
      ) : (
        <ul className="ss-match-list">
          {community.eventRefs.map((e) => (
            <li key={e.id} className="ss-match-item">
              <div className="ss-rec-kind">
                {e.role} · {e.visibility}
              </div>
              <div className="ss-rec-title">
                {e.url ? (
                  <a href={e.url} target="_blank" rel="noopener noreferrer">
                    {e.name}
                  </a>
                ) : (
                  e.name
                )}
              </div>
              <div className="ss-rec-reason">
                {[e.city, e.start ? new Date(e.start).toLocaleString() : null]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              {isOwner && (
                <button type="button" className="veridian-action" onClick={() => onDetach(e.id)}>
                  remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {isOwner && (
        <>
          <h2 className="dash-section-title">attach from Luma scene</h2>
          <p className="sub" style={{ marginBottom: 10 }}>
            choose hosting or attending — visibility is opt-in per event.
          </p>
          <EventAttachPanel events={events} onAttach={onAttach} attachedIds={attachedIds} />

          <h2 className="dash-section-title">attach from Ticketmaster / Eventbrite / Partiful</h2>
          <p className="sub" style={{ marginBottom: 10 }}>
            search configured providers or paste an event URL.
          </p>
          <ProviderEventBrowser
            city={community.city ?? digest?.cities[0]}
            onAttach={(ref: SceneEventRef) => {
              if (!store || !community) return;
              let next = attachEventToCommunity(store, community.id, ref);
              next = logAgentAction(next, {
                agentRef: "veridian",
                action: "attach_event",
                detail: `${ref.source} · ${ref.role} · ${ref.name}`,
                autonomy: "draft",
              });
              persist(next);
              flash(`attached from ${ref.source}`);
            }}
          />
        </>
      )}
    </FadeIn>
  );
}
