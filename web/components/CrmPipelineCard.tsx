"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CRM_STATUSES,
  CRM_STATUS_LABEL,
  loadCrm,
  pipelineCounts,
  suggestActions,
  type CrmSuggestion,
} from "@/lib/crm";

type Props = {
  sceneQs?: string;
  convergingHosts?: { id: string; name: string; eventName: string; overlap: number }[];
};

export default function CrmPipelineCard({ sceneQs = "", convergingHosts = [] }: Props) {
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [followUps, setFollowUps] = useState<CrmSuggestion[]>([]);

  useEffect(() => {
    const store = loadCrm();
    setTotal(store.contacts.length);
    setCounts(pipelineCounts(store.contacts));
    setFollowUps(
      suggestActions(store.contacts, { convergingHosts }).filter(
        (s) => s.kind === "due" || s.kind === "stale",
      ).slice(0, 3),
    );
  }, [convergingHosts]);

  const crmHref = sceneQs ? `/crm?${sceneQs}` : "/crm";

  const pipes = useMemo(
    () => CRM_STATUSES.map((s) => ({ s, n: counts[s] ?? 0 })),
    [counts],
  );

  return (
    <section className="crm-snap" aria-label="CRM pipeline">
      <div className="cal-head">
        <div>
          <div className="cal-title">CRM</div>
          <div className="cal-sub">{total} contacts · on-device</div>
        </div>
        <a className="cal-btn" href={crmHref}>
          open
        </a>
      </div>

      <div className="crm-snap-pipes">
        {pipes.map(({ s, n }) => (
          <div key={s} className="crm-snap-pipe">
            <span className="n">{n}</span>
            <span className="l">{CRM_STATUS_LABEL[s]}</span>
          </div>
        ))}
      </div>

      {followUps.length > 0 && (
        <ul className="crm-snap-next">
          {followUps.map((f) => (
            <li key={`${f.kind}-${f.name}`}>
              <strong>{f.name}</strong>
              <span>{f.reason}</span>
            </li>
          ))}
        </ul>
      )}

      {total === 0 && (
        <p className="cal-sub" style={{ marginTop: 10 }}>
          Nobody here yet. Open People to add someone.
        </p>
      )}
    </section>
  );
}
