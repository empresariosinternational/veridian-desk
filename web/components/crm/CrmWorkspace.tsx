"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CRM_STATUSES,
  CRM_STATUS_LABEL,
  type CrmContact,
  type CrmStatus,
  type CrmStore,
  addManualContact,
  draftOpener,
  exportCrmJson,
  importCrmJson,
  loadCrm,
  pipelineCounts,
  removeContact,
  saveCrm,
  seedFromScene,
  upsertContact,
} from "@/lib/crm";
import type { EventRow } from "@/lib/luma";

type Follow = { id: string; name: string; events: number; avatar?: string | null };

type Props = {
  following: Follow[];
  people: Record<string, { name: string; avatar?: string | null }>;
  events: EventRow[];
};

export default function CrmWorkspace({ following, people, events }: Props) {
  const [store, setStore] = useState<CrmStore>({ version: 1, contacts: [] });
  const [ready, setReady] = useState(false);
  const [filter, setFilter] = useState<CrmStatus | "all">("all");
  const [q, setQ] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    setStore(loadCrm());
    setReady(true);
  }, []);

  const persist = useCallback((next: CrmStore) => {
    setStore(next);
    saveCrm(next);
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };

  const counts = useMemo(() => pipelineCounts(store.contacts), [store.contacts]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return store.contacts.filter((c) => {
      if (filter !== "all" && c.status !== filter) return false;
      if (!qq) return true;
      return (
        c.name.toLowerCase().includes(qq) ||
        c.notes.toLowerCase().includes(qq) ||
        c.tags.some((t) => t.includes(qq))
      );
    });
  }, [store.contacts, filter, q]);

  const active = store.contacts.find((c) => c.id === activeId) ?? null;

  const eventsForContact = (c: CrmContact) => {
    if (!c.lumaId) return [];
    return events.filter((e) => e.host_ids.includes(c.lumaId!)).slice(0, 4);
  };

  const onImportScene = () => {
    const hostMap = new Map<string, Follow>();
    for (const e of events) {
      for (const hid of e.host_ids) {
        if (!hostMap.has(hid)) {
          const p = people[hid];
          hostMap.set(hid, {
            id: hid,
            name: p?.name || hid,
            events: 0,
            avatar: p?.avatar,
          });
        }
      }
    }
    const before = store.contacts.length;
    const next = seedFromScene(store, {
      following,
      hosts: [...hostMap.values()],
    });
    persist(next);
    flash(`imported ${next.contacts.length - before} contacts`);
  };

  const onExport = () => {
    const blob = new Blob([exportCrmJson(store)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agentscene-crm-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const next = importCrmJson(text);
      persist(next);
      flash(`restored ${next.contacts.length} contacts`);
    } catch {
      flash("import failed — invalid file");
    }
  };

  const patchActive = (patch: Partial<CrmContact>) => {
    if (!active) return;
    persist(upsertContact(store, { ...active, ...patch }));
  };

  const onAddManual = () => {
    const name = newName.trim();
    if (!name) return;
    const next = addManualContact(store, { name });
    persist(next);
    setNewName("");
    setActiveId(next.contacts[0]?.id ?? null);
  };

  if (!ready) {
    return <p className="sub">loading CRM…</p>;
  }

  return (
    <div className="crm-workspace">
      <div className="crm-toolbar">
        <div className="crm-pipeline" role="tablist" aria-label="pipeline">
          <button
            type="button"
            className={`crm-pipe${filter === "all" ? " on" : ""}`}
            onClick={() => setFilter("all")}
          >
            all <span>{store.contacts.length}</span>
          </button>
          {CRM_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={`crm-pipe${filter === s ? " on" : ""}`}
              onClick={() => setFilter(s)}
            >
              {CRM_STATUS_LABEL[s]} <span>{counts[s]}</span>
            </button>
          ))}
        </div>
        <div className="crm-tools">
          <button type="button" className="crm-btn" onClick={onImportScene}>
            import events
          </button>
          <button type="button" className="crm-btn ghost" onClick={onExport}>
            export
          </button>
          <label className="crm-btn ghost crm-file">
            import
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImportFile(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      <div className="crm-add-row">
        <input
          className="crm-search"
          placeholder="Search your contacts"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="search contacts"
        />
        <form
          className="crm-add-form"
          onSubmit={(e) => {
            e.preventDefault();
            onAddManual();
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Add someone by name"
            aria-label="new contact name"
          />
          <button type="submit" className="crm-btn">
            add
          </button>
        </form>
      </div>

      {toast && <div className="crm-toast">{toast}</div>}

      <div className="crm-body">
        <ul className="crm-list" aria-label="contacts">
          {filtered.length === 0 && (
            <li className="crm-empty">
              {store.contacts.length === 0
                ? "No contacts yet. Type a name above to add one."
                : "no matches."}
            </li>
          )}
          {filtered.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={`crm-row${activeId === c.id ? " on" : ""}`}
                onClick={() => setActiveId(c.id)}
              >
                {c.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="crm-avatar" src={c.avatar} alt="" loading="lazy" />
                ) : (
                  <span className="crm-avatar crm-avatar-fallback" aria-hidden>
                    {c.name.trim().charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="crm-row-meta">
                  <span className="crm-row-name">{c.name}</span>
                  <span className="crm-row-sub">
                    {CRM_STATUS_LABEL[c.status]}
                    {c.nextDue ? ` · due ${c.nextDue}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="crm-detail" aria-live="polite">
          {!active && (
            <p className="sub" style={{ margin: 0 }}>
              Pick someone to add notes and a reminder to follow up.
            </p>
          )}
          {active && (
            <>
              <div className="crm-detail-head">
                {active.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="crm-avatar lg" src={active.avatar} alt="" />
                ) : (
                  <span className="crm-avatar lg crm-avatar-fallback" aria-hidden>
                    {active.name.trim().charAt(0).toUpperCase()}
                  </span>
                )}
                <div>
                  <h2 className="crm-detail-name">{active.name}</h2>
                  <div className="crm-detail-src">{active.source} · on-device</div>
                </div>
                <button
                  type="button"
                  className="crm-btn ghost danger"
                  onClick={() => {
                    persist(removeContact(store, active.id));
                    setActiveId(null);
                  }}
                >
                  remove
                </button>
              </div>

              <label className="crm-field">
                <span>status</span>
                <select
                  value={active.status}
                  onChange={(e) => patchActive({ status: e.target.value as CrmStatus })}
                >
                  {CRM_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {CRM_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="crm-field">
                <span>notes</span>
                <textarea
                  rows={4}
                  value={active.notes}
                  onChange={(e) => patchActive({ notes: e.target.value })}
                  placeholder="context, how you met, what they care about…"
                />
              </label>

              <label className="crm-field">
                <span>next action</span>
                <input
                  value={active.nextAction}
                  onChange={(e) => patchActive({ nextAction: e.target.value })}
                  placeholder="e.g. send opener before Friday"
                />
              </label>

              <div className="crm-field-row">
                <label className="crm-field">
                  <span>due</span>
                  <input
                    type="date"
                    value={active.nextDue ?? ""}
                    onChange={(e) => patchActive({ nextDue: e.target.value || null })}
                  />
                </label>
                <label className="crm-field">
                  <span>last touch</span>
                  <input
                    type="datetime-local"
                    value={
                      active.lastTouch
                        ? active.lastTouch.slice(0, 16)
                        : ""
                    }
                    onChange={(e) =>
                      patchActive({
                        lastTouch: e.target.value ? new Date(e.target.value).toISOString() : null,
                      })
                    }
                  />
                </label>
              </div>

              <div className="crm-draft-box">
                <div className="veridian-draft-label">veridian draft</div>
                <p>
                  {draftOpener(
                    active.name,
                    eventsForContact(active)[0]?.name,
                  )}
                </p>
                <button
                  type="button"
                  className="crm-btn"
                  onClick={async () => {
                    const text = draftOpener(active.name, eventsForContact(active)[0]?.name);
                    try {
                      await navigator.clipboard.writeText(text);
                      flash("draft copied");
                    } catch {
                      flash("copy failed");
                    }
                  }}
                >
                  copy draft
                </button>
                <button
                  type="button"
                  className="crm-btn ghost"
                  onClick={() => {
                    patchActive({ lastTouch: new Date().toISOString(), status: "waiting" });
                    flash("marked as reached out");
                  }}
                >
                  mark reached out
                </button>
              </div>

              {eventsForContact(active).length > 0 && (
                <div className="crm-linked">
                  <div className="crm-linked-label">upcoming with them</div>
                  <ul>
                    {eventsForContact(active).map((e) => (
                      <li key={e.id}>
                        {e.url ? (
                          <a href={e.url} target="_blank" rel="noopener noreferrer">
                            {e.name}
                          </a>
                        ) : (
                          e.name
                        )}
                        <span> · {e.city}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
