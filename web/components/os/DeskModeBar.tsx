import Link from "next/link";
import VeridianMark from "@/components/VeridianMark";

const STATES = [
  { word: "idle", meaning: "white", cls: "os-node-white" },
  { word: "listening", meaning: "red · armed for one capture", cls: "os-node-red" },
  { word: "working", meaning: "amber", cls: "os-node-amber" },
  { word: "filed", meaning: "green", cls: "os-node-green" },
  { word: "urgent", meaning: "the current color blinks", cls: "os-node-urgent" },
];

/** Desk mode: the front desk screen, full width, readable from across the room. */
export function DeskModeTop({ focus }: { focus: boolean }) {
  return (
    <div className={`os-deskbar${focus ? " is-focus" : ""}`}>
      <div className="os-deskbar-title">
        <VeridianMark size={20} />
        <span className="eyebrow">{focus ? "desk mode · front desk" : "desk"}</span>
      </div>
      {focus ? (
        <Link href="/desk" prefetch={false} className="os-btn-ghost">Exit desk mode</Link>
      ) : (
        <Link href="/desk/focus" prefetch={false} className="os-btn-ghost">Open desk mode</Link>
      )}
    </div>
  );
}

export function DeskLegend() {
  return (
    <section className="os-legend" aria-labelledby="os-legend-title">
      <h2 id="os-legend-title">The front desk node mirrors this screen</h2>
      <ul>
        {STATES.map((s) => (
          <li key={s.word}>
            <span className={`os-node-dot ${s.cls}`} aria-hidden />
            <strong>{s.word}</strong>
            <span>{s.meaning}</span>
          </li>
        ))}
      </ul>
      <p>Its button arms and disarms the mic. Presence only shows a welcome banner; it never starts recording.</p>
    </section>
  );
}
