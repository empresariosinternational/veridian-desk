import Link from "next/link";
import FadeIn from "@/components/motion/FadeIn";
import { addDays, endOfWorkWeek, fmtDay, giveMiamiDay, nextWeekday, todayISO, daysBetween } from "@/lib/desk/time";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Events · Veridian Desk",
  description: "Tidepath's dates that matter: workshops, donor days, report deadlines and volunteer shifts.",
};

type Item = { date: string; title: string; who: string; desk: string; step: number };

function when(today: string, date: string): string {
  const d = daysBetween(today, date);
  return d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`;
}

export default function EventsPage() {
  const today = todayISO();
  const gmd = giveMiamiDay(today);
  const items: Item[] = [
    { date: nextWeekday(today, 4), title: "Workshop at Edison Elementary, in Spanish", who: "Yesenia · front desk", desk: "Becomes a workshop card with a room, a Spanish-speaking facilitator and a parent flyer, each with an owner.", step: 3 },
    { date: endOfWorkWeek(today), title: "Missed-mentoring calls due", who: "Marisol · programs", desk: "Every family who missed a session is on her call list, and the count goes straight into the quarterly report.", step: 1 },
    { date: nextWeekday(today, 6), title: "Saturday volunteer driving shifts", who: "Owen · volunteers", desk: "Say “we need a driver” and the shift goes only to volunteers who drive in that neighborhood.", step: 5 },
    { date: gmd.date, title: "Give Miami Day", who: "Denise · fundraising", desk: "Lapsed donors get a call list ahead of the day, with duplicates merged so no one is asked twice.", step: 2 },
    { date: addDays(gmd.date, 12), title: "County youth safety grant: quarterly update due", who: "Claudette · director", desk: "The desk drafts the update using only numbers it can trace to a real record, and leaves counseling notes out.", step: 6 },
  ]
    .filter((i) => daysBetween(today, i.date) >= 0)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return (
    <>
      <FadeIn>
        <div className="eyebrow">Events</div>
        <h1>What is coming up at Tidepath</h1>
        <p className="sub" style={{ marginTop: 8, maxWidth: 680 }}>
          The dates the team is working toward. Tap any one to watch the desk handle it.
        </p>
      </FadeIn>

      <FadeIn delay={0.04}>
        <ol style={{ listStyle: "none", padding: 0, margin: "20px 0 0", display: "flex", flexDirection: "column", gap: 12, maxWidth: 820 }}>
          {items.map((i) => {
            const d = new Date(`${i.date}T12:00:00Z`);
            const mon = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(d).toUpperCase();
            return (
              <li key={i.title}>
                <Link
                  href={`/desk?tour=${i.step}`}
                  prefetch={false}
                  style={{ display: "flex", gap: 16, alignItems: "flex-start", padding: "16px 18px", borderRadius: 16, background: "rgba(99,53,190,0.07)", border: "1px solid rgba(99,53,190,0.14)", textDecoration: "none", color: "inherit" }}
                >
                  <div className="os-date-tile" style={{ flexShrink: 0 }}><span>{mon}</span><strong>{Number(i.date.slice(8, 10))}</strong></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, opacity: 0.7 }}>{fmtDay(i.date)} · {when(today, i.date)} · {i.who}</div>
                    <h2 style={{ fontSize: 18, margin: "2px 0 6px", lineHeight: 1.3, textTransform: "none", letterSpacing: 0 }}>{i.title}</h2>
                    <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45, opacity: 0.85 }}>{i.desk}</p>
                    <span style={{ display: "inline-block", marginTop: 8, fontSize: 14, fontWeight: 600, color: "#6335BE" }}>Watch the desk do it →</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      </FadeIn>
    </>
  );
}
