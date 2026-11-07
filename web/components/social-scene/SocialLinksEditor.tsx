"use client";

import { useState } from "react";
import type { SocialNetworkLink } from "@/lib/social-scene";
import { SOCIAL_NETWORKS, normalizeSocialInput, type SocialNetwork } from "@/lib/social-links";

type Props = {
  links: SocialNetworkLink[];
  onChange: (links: SocialNetworkLink[]) => void;
};

export default function SocialLinksEditor({ links, onChange }: Props) {
  const [network, setNetwork] = useState<SocialNetwork>("instagram");
  const [raw, setRaw] = useState("");

  const add = () => {
    const link = normalizeSocialInput(network, raw);
    if (!link) return;
    const next = links.filter((l) => l.network !== link.network);
    onChange([...next, link]);
    setRaw("");
  };

  return (
    <div className="ss-social-edit">
      <p className="sub" style={{ marginTop: 0 }}>
        attested public profiles — packed into Veridian capability cards. no graph scraping.
      </p>
      <div className="ss-create">
        <select
          value={network}
          onChange={(e) => setNetwork(e.target.value as SocialNetwork)}
          aria-label="network"
        >
          {SOCIAL_NETWORKS.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label}
            </option>
          ))}
        </select>
        <input
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={SOCIAL_NETWORKS.find((n) => n.id === network)?.placeholder}
          aria-label="profile url or handle"
        />
        <button type="button" className="crm-btn" onClick={add}>
          add
        </button>
      </div>
      <ul className="ss-match-list">
        {links.length === 0 && <li className="sub">no social links yet.</li>}
        {links.map((l) => (
          <li key={l.network} className="ss-match-item">
            <div className="ss-rec-kind">{l.network}</div>
            <div className="ss-rec-title">
              <a href={l.url} target="_blank" rel="noopener noreferrer">
                @{l.handle}
              </a>
            </div>
            <button
              type="button"
              className="veridian-action"
              onClick={() => onChange(links.filter((x) => x.network !== l.network))}
            >
              remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
