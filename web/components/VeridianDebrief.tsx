"use client";

import { useState } from "react";
import VeridianMark from "@/components/VeridianMark";
import {
  type CrmContact,
  draftOpener,
  loadCrm,
  newContactId,
  nowIso,
  saveCrm,
  upsertContact,
} from "@/lib/crm";

export type DebriefItem = {
  name: string;
  reason: string;
  draft?: string;
  /** When set, enables "add to CRM" */
  contact?: {
    id?: string;
    name: string;
    avatar?: string | null;
  };
};

type Props = {
  title: string;
  intro?: string;
  items: DebriefItem[];
};

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return Promise.reject();
}

export default function VeridianDebrief({ title, intro, items }: Props) {
  const [added, setAdded] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<Record<string, boolean>>({});

  if (items.length === 0) return null;

  const onAdd = (it: DebriefItem) => {
    const person = it.contact ?? { name: it.name };
    const store = loadCrm();
    const existing = store.contacts.find(
      (c) =>
        (person.id && c.lumaId === person.id) ||
        c.name.trim().toLowerCase() === person.name.trim().toLowerCase(),
    );
    if (existing) {
      setAdded((a) => ({ ...a, [it.name]: true }));
      return;
    }
    const now = nowIso();
    const contact: CrmContact = {
      id: newContactId(),
      name: person.name,
      avatar: person.avatar ?? null,
      lumaId: person.id ?? null,
      status: "reach_out",
      notes: it.reason,
      nextAction: "send opener",
      nextDue: null,
      lastTouch: null,
      tags: ["veridian"],
      source: "manual",
      createdAt: now,
      updatedAt: now,
    };
    saveCrm(upsertContact(store, contact));
    setAdded((a) => ({ ...a, [it.name]: true }));
  };

  const onCopy = async (it: DebriefItem) => {
    const text = it.draft || draftOpener(it.name);
    try {
      await copyText(text);
      setCopied((c) => ({ ...c, [it.name]: true }));
      window.setTimeout(() => setCopied((c) => ({ ...c, [it.name]: false })), 1800);
    } catch {
      /* ignore */
    }
  };

  return (
    <section className="veridian-card" aria-label={title}>
      <div className="veridian-head">
        <VeridianMark size={16} />
        <span className="veridian-title">{title}</span>
        <span className="veridian-tag">veridian</span>
      </div>
      {intro && <p className="veridian-intro">{intro}</p>}
      <ul className="veridian-items">
        {items.map((it) => (
          <li key={it.name}>
            <div className="veridian-item-name">{it.name}</div>
            <div className="veridian-item-reason">{it.reason}</div>
            {it.draft && (
              <div className="veridian-draft">
                <span className="veridian-draft-label">draft opener</span>
                {it.draft}
              </div>
            )}
            <div className="veridian-actions">
              <button
                type="button"
                className="veridian-action"
                onClick={() => onAdd(it)}
                disabled={!!added[it.name]}
              >
                {added[it.name] ? "in CRM" : "add to CRM"}
              </button>
              <button type="button" className="veridian-action" onClick={() => onCopy(it)}>
                {copied[it.name] ? "copied" : "copy draft"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
