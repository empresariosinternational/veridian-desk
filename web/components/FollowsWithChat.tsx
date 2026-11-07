"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { type ChatPeer, isDemoChatPeer } from "@/lib/chat-demo";

// Chat drawer is heavy (framer drawer + demo threads) and only needed on tap —
// keep it out of the initial bundle.
const PeerChat = dynamic(() => import("@/components/PeerChat"), { ssr: false });

type Follow = {
  id: string;
  name: string;
  events: number;
  avatar?: string | null;
};

type Props = {
  following: Follow[];
};

export default function FollowsWithChat({ following }: Props) {
  const [activePeer, setActivePeer] = useState<ChatPeer | null>(null);
  const [chatMounted, setChatMounted] = useState(false);

  const demoPeers = useMemo(
    () => following.filter((f) => isDemoChatPeer(f.name)),
    [following],
  );

  if (following.length === 0) {
    return (
      <p className="sub" style={{ marginTop: 8 }}>
        no follows yet — paste a Luma host above to start your list.
      </p>
    );
  }

  return (
    <>
      {demoPeers.length > 0 && (
        <p className="chat-demo-hint">
          peer-to-peer chat demo — message {demoPeers.map((p) => p.name).join(" or ")}
        </p>
      )}

      <ul className="follow-chips">
        {following.map((f) => {
          const chatEnabled = isDemoChatPeer(f.name);
          return (
            <li key={f.id} className={`follow-chip${f.events > 0 ? "" : " muted"}${chatEnabled ? " chat-enabled" : ""}`}>
              {f.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="follow-avatar" src={f.avatar} alt="" loading="lazy" />
              ) : (
                <span className="follow-avatar follow-avatar-fallback" aria-hidden="true">
                  {f.name.trim().charAt(0).toUpperCase()}
                </span>
              )}
              <span className="follow-meta">
                <span className="follow-name">{f.name}</span>
                <span className="follow-evt">
                  {f.events > 0 ? `${f.events} upcoming` : "no upcoming events"}
                </span>
              </span>
              {chatEnabled && (
                <button
                  type="button"
                  className="follow-chat-btn"
                  aria-label={`message ${f.name}`}
                  onClick={() => {
                    setChatMounted(true);
                    setActivePeer({ id: f.id, name: f.name, avatar: f.avatar });
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {chatMounted && <PeerChat peer={activePeer} onClose={() => setActivePeer(null)} />}
    </>
  );
}
