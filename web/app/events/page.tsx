import Link from "next/link";
import { buildDigestCached } from "@/lib/luma";
import { getServerSessionKey } from "@/lib/luma-session";
import { parseParams } from "@/lib/defaults";
import EventTimeline from "@/components/EventTimeline";
import CalendarCard from "@/components/CalendarCard";
import FadeIn from "@/components/motion/FadeIn";
import { fmtDay, giveMiamiDay, todayISO } from "@/lib/desk/time";

export const revalidate = 1800;

export const metadata = {
  title: "Events · agentscene",
  description: "Community dates and what the people you follow are throwing.",
};

type SP = Promise<Record<string, string | undefined>>;

export default async function EventsPage({ searchParams }: { searchParams: SP }) {
  const spRaw = await searchParams;
  const sp: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(spRaw)) sp[k] = Array.isArray(v) ? (v as any)[0] : (v as any);

  const { cities, follows, aliases } = parseParams(sp);
  const sessionKey = await getServerSessionKey();
  const data = await buildDigestCached({ cities, follows, cityAliases: aliases, sessionKey });
  const sceneQs = new URLSearchParams({
    ...(sp.cities ? { cities: sp.cities } : {}),
    ...(sp.follows ? { follows: sp.follows } : {}),
  }).toString();

  const upcoming = [...Object.values(data.groups).flat(), ...data.elsewhere]
    .filter((e) => e.start)
    .sort((a, b) => (a.start! < b.start! ? -1 : 1))
    .slice(0, 24);
  const gmd = giveMiamiDay(todayISO());
  const gmdMonth = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(`${gmd.date}T12:00:00Z`)).toUpperCase();
  const gmdDay = Number(gmd.date.slice(8, 10));

  return (
    <>
      <FadeIn>
        <div className="eyebrow">Events</div>
        <h1>What is coming up</h1>
        <p className="sub" style={{ marginTop: 8 }}>
          Tidepath’s big dates first, then other events around Miami. When a date needs helpers, Veridian lines them up for you.
        </p>
      </FadeIn>

      <div className="dash-grid">
        <div className="dash-main">
          {gmd.daysAway >= 0 && (
            <FadeIn delay={0.04}>
              <section className="os-event-feature" aria-label="Give Miami Day">
                <div className="os-date-tile os-date-tile-lg"><span>{gmdMonth}</span><strong>{gmdDay}</strong></div>
                <div>
                  <h2>Give Miami Day</h2>
                  <p>{fmtDay(gmd.date)} · {gmd.daysAway === 0 ? "today" : gmd.daysAway === 1 ? "tomorrow" : `${gmd.daysAway} days away`}. Event helpers and thank-yous run through Today and the desk.</p>
                  <div className="os-move-actions">
                    <Link href={`/${sceneQs ? `?${sceneQs}` : ""}`} prefetch={false} className="os-btn">Line up helpers</Link>
                    <Link href="/desk" prefetch={false} className="os-btn-ghost">Open the desk</Link>
                  </div>
                </div>
              </section>
            </FadeIn>
          )}

          <FadeIn delay={0.06}>
            <h2 className="dash-section-title">Other events around Miami</h2>
            {upcoming.length > 0 ? (
              <EventTimeline events={upcoming} people={data.people} />
            ) : (
              <p className="sub">
                Nothing on the calendar yet. <Link href="/setup#scene">Add a zip or a host</Link> to fill it.
              </p>
            )}
          </FadeIn>
        </div>

        <aside className="dash-rail" aria-label="calendar">
          <FadeIn delay={0.08}>
            <CalendarCard sceneQs={sceneQs} />
          </FadeIn>
        </aside>
      </div>
    </>
  );
}
