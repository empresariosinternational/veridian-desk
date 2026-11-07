import { buildDigestCached } from "@/lib/luma";
import { getServerSessionKey } from "@/lib/luma-session";
import { parseParams, citySlug } from "@/lib/defaults";
import { notFound } from "next/navigation";
import FadeIn from "@/components/motion/FadeIn";
import EventTimeline from "@/components/EventTimeline";
import VeridianDebrief, { type DebriefItem } from "@/components/VeridianDebrief";

export const revalidate = 1800;

type SP = Promise<Record<string, string | undefined>>;

export default async function CityPage({ params, searchParams }: { params: Promise<{ city: string }>; searchParams: SP }) {
  const { city } = await params;
  const spRaw = await searchParams;
  const sp: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(spRaw)) sp[k] = Array.isArray(v) ? (v as any)[0] : (v as any);

  const { cities, follows, aliases } = parseParams(sp);
  const cityName = cities.find((c) => citySlug(c) === city);
  if (!cityName) notFound();

  const sessionKey = await getServerSessionKey();
  const data = await buildDigestCached({ cities, follows, cityAliases: aliases, sessionKey });
  const events = data.groups[cityName] || [];
  const featured = events.filter((e) => e.overlap > 1);

  const qs = new URLSearchParams(sp as any).toString();
  const homeHref = qs ? `/?${qs}` : "/";

  // CRM-lite debrief: rank hosts to meet in this city by convergence, then activity.
  const hostStats = new Map<string, { events: number; featured: number; topEvent: string }>();
  for (const e of events) {
    for (const h of e.host_ids) {
      const s = hostStats.get(h) ?? { events: 0, featured: 0, topEvent: e.name };
      s.events += 1;
      if (e.overlap > 1) s.featured += 1;
      hostStats.set(h, s);
    }
  }
  const debriefItems: DebriefItem[] = [...hostStats.entries()]
    .sort(([, a], [, b]) => (b.featured - a.featured) || (b.events - a.events))
    .slice(0, 3)
    .map(([id, s]) => {
      const person = data.people[id];
      const name = person?.name || id;
      return {
        name,
        reason:
          s.featured > 0
            ? `hosting ${s.featured} convergence ${s.featured === 1 ? "event" : "events"} with others you follow — highest-leverage intro in ${cityName}.`
            : `hosting ${s.events} ${s.events === 1 ? "event" : "events"} in ${cityName} this week (next: ${s.topEvent}).`,
        draft: `hey ${name.split(" ")[0]} — I'll be at ${s.topEvent}. would love to say hi before the room fills up.`,
        contact: { id, name, avatar: person?.avatar },
      };
    });

  return (
    <>
      <FadeIn>
        <a href={homeHref} className="back">← all cities</a>
        <div className="eyebrow">{events.length} upcoming events</div>
        <h1>{cityName}</h1>
        <p className="sub" style={{ marginTop: 8 }}>
          {featured.length > 0
            ? `${featured.length} ${featured.length === 1 ? "event has" : "events have"} multiple people you follow — those are the heat-map picks.`
            : "no overlap yet — just single-host events from your follows."}
        </p>
      </FadeIn>

      {debriefItems.length > 0 && (
        <FadeIn delay={0.05}>
          <VeridianDebrief
            title={`who to meet · ${cityName}`}
            intro="Ranked by convergence with your follows, then activity. Drafts are suggestions only — nothing sends without you."
            items={debriefItems}
          />
        </FadeIn>
      )}

      {events.length > 0 && (
        <FadeIn delay={0.06}>
          <EventTimeline events={events} people={data.people} />
        </FadeIn>
      )}

      {events.length === 0 && (
        <FadeIn>
          <div className="empty">nothing in {cityName} yet — try adding more follows.</div>
        </FadeIn>
      )}
    </>
  );
}
