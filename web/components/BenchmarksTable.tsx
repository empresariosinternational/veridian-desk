"use client";

import { useMemo, useState } from "react";
import {
  MODEL_REGISTRY,
  type ModelRegistryEntry,
  fmtContext,
  fmtPrice,
} from "@/lib/models";

type SortKey = "agenticScore" | "inputPerMillion" | "contextWindow";

export default function BenchmarksTable() {
  const [openOnly, setOpenOnly] = useState(false);
  const [localOnly, setLocalOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("agenticScore");

  const rows = useMemo(() => {
    let list: ModelRegistryEntry[] = [...MODEL_REGISTRY];
    if (openOnly) list = list.filter((m) => m.openWeight);
    if (localOnly) list = list.filter((m) => m.localDeployable);
    list.sort((a, b) => {
      if (sortKey === "inputPerMillion") {
        return (a.inputPerMillion ?? Infinity) - (b.inputPerMillion ?? Infinity);
      }
      return (b[sortKey] as number) - (a[sortKey] as number);
    });
    return list;
  }, [openOnly, localOnly, sortKey]);

  return (
    <div className="bench">
      <div className="bench-controls">
        <button
          type="button"
          className={openOnly ? "bench-toggle on" : "bench-toggle"}
          onClick={() => setOpenOnly((v) => !v)}
        >
          open-weight
        </button>
        <button
          type="button"
          className={localOnly ? "bench-toggle on" : "bench-toggle"}
          onClick={() => setLocalOnly((v) => !v)}
        >
          local-deployable
        </button>
        <label className="bench-sort">
          sort
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            <option value="agenticScore">agentic score</option>
            <option value="inputPerMillion">price (input)</option>
            <option value="contextWindow">context window</option>
          </select>
        </label>
      </div>

      <div className="bench-table-wrap">
        <table className="bench-table">
          <thead>
            <tr>
              <th>model</th>
              <th>provider</th>
              <th className="num">agentic</th>
              <th className="num">context</th>
              <th className="num">$/M in</th>
              <th className="num">$/M out</th>
              <th>deploy</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.modelId}>
                <td>
                  <span className="bench-name">{m.displayName}</span>
                </td>
                <td className="bench-provider">{m.provider}</td>
                <td className="num">
                  <span className="bench-score">{m.agenticScore}</span>
                </td>
                <td className="num">{fmtContext(m.contextWindow)}</td>
                <td className="num">{fmtPrice(m.inputPerMillion)}</td>
                <td className="num">{fmtPrice(m.outputPerMillion)}</td>
                <td>
                  {m.openWeight && <span className="bench-pill">open</span>}
                  {m.localDeployable && <span className="bench-pill">local</span>}
                  {!m.openWeight && !m.localDeployable && (
                    <span className="bench-pill dim">api</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <div className="empty">no models match those filters.</div>
      )}
    </div>
  );
}
