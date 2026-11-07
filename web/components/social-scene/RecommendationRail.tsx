"use client";

import { useState } from "react";
import VeridianMark from "@/components/VeridianMark";
import type { Recommendation } from "@/lib/social-scene";

type Props = {
  items: Recommendation[];
  title?: string;
  onAddToCrm?: (rec: Recommendation) => void;
};

export default function RecommendationRail({
  items,
  title = "veridian suggests",
  onAddToCrm,
}: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (rec: Recommendation) => {
    if (!rec.draft) return;
    try {
      await navigator.clipboard.writeText(rec.draft);
      setCopied(rec.id);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      /* ignore */
    }
  };

  if (items.length === 0) {
    return (
      <section className="ss-rec-rail" aria-label={title}>
        <div className="ss-rec-head">
          <VeridianMark size={14} />
          <span>{title}</span>
        </div>
        <p className="sub" style={{ margin: "8px 0 0" }}>
          curate a community or connect your scene to unlock recommendations.
        </p>
      </section>
    );
  }

  return (
    <section className="ss-rec-rail" aria-label={title}>
      <div className="ss-rec-head">
        <VeridianMark size={14} />
        <span>{title}</span>
        <span className="veridian-tag">veridian</span>
      </div>
      <ul className="ss-rec-list">
        {items.map((r) => (
          <li key={r.id}>
            <div className="ss-rec-kind">{r.kind}</div>
            <div className="ss-rec-title">
              {r.href ? (
                <a href={r.href} target={r.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">
                  {r.title}
                </a>
              ) : (
                r.title
              )}
            </div>
            <div className="ss-rec-reason">{r.reason}</div>
            {r.draft && (
              <div className="veridian-draft">
                <span className="veridian-draft-label">draft</span>
                {r.draft}
              </div>
            )}
            <div className="veridian-actions">
              {r.draft && (
                <button type="button" className="veridian-action" onClick={() => copy(r)}>
                  {copied === r.id ? "copied" : "copy draft"}
                </button>
              )}
              {onAddToCrm && (r.kind === "host" || r.kind === "profile") && (
                <button type="button" className="veridian-action" onClick={() => onAddToCrm(r)}>
                  add to CRM
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
