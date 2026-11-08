import { buildDigestCached } from "@/lib/luma";
import { getServerSessionKey } from "@/lib/luma-session";
import { parseParams, citySlug } from "@/lib/defaults";
import AddHost from "@/components/AddHost";
import EventTimeline from "@/components/EventTimeline";
import FollowsWithChat from "@/components/FollowsWithChat";
import VeridianDebrief, { type DebriefItem } from "@/components/VeridianDebrief";
import TodayBoard from "@/components/os/TodayBoard";
import CalendarCard from "@/components/CalendarCard";
import CrmPipelineCard from "@/components/CrmPipelineCard";
import { SceneBridgeSync } from "@/components/SceneBridge";
import FadeIn from "@/components/motion/FadeIn";
import StaggerList from "@/components/motion/StaggerList";

export const revalidate = 1800;

type SP = Promise<Record<string, string | undefined>>;

export default async function Home({ searchParams }: { searchParams: SP }) {
  const spRaw = await searchParams;
  const sp: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(spRaw)) sp[k] = Array.isArray(v) ? (v as any)[0] : (v as any);

  const { cities, follows, aliases } = parseParams(sp);
  const sessionKey = await getServerSessionKey();
  const data = await buildDigestCached({ cities, follows, cityAliases: aliases, sessionKey });
  const cityHrefs: Record<string, string> = {};
  const sceneQs = new URLSearchParams({
    ...(sp.cities ? { cities: sp.cities } : {}),
    ...(sp.follows ? { follows: sp.follows } : {}),
  }).toString();
  for (const c of cities) {
    cityHrefs[c] = `/c/${citySlug(c)}${sceneQs ? `?${sceneQs}` : ""}`;
  }

  const totalEvents = data.totals.events;
  const allEvents = Object.values(data.groups).flat();
  const weekEvents = [...allEvents, ...data.elsewhere]
    .filter((e) => e.start)
    .sort((a, b) => (a.start! < b.start! ? -1 : 1))
    .slice(0, 10);

  const weekStart = Date.now() - 3_600_000;
  const weekEnd = Date.now() + 7 * 86_400_000;
  const weekCount = [...allEvents, ...data.elsewhere].filter((e) => {
    const t = e.start ? Date.parse(e.start) : NaN;
    return Number.isFinite(t) && t >= weekStart && t <= weekEnd;
  }).length;
  const featuredEvents = allEvents
    .filter((e) => e.overlap > 1)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 2);

  const convergingHosts = featuredEvents.flatMap((e) =>
    e.host_ids.slice(0, 2).map((id) => ({
      id,
      name: data.people[id]?.name || id,
      eventName: e.name,
      overlap: e.overlap,
    })),
  );

  const debriefItems: DebriefItem[] = featuredEvents.map((e) => {
    const hostId = e.host_ids[0];
    const hostName = hostId ? data.people[hostId]?.name : null;
    return {
      name: e.name,
      reason: `${e.overlap} of your follows converge here (${e.match_city ?? e.city}) — highest-signal room of the week.`,
      draft: hostName
        ? `hey ${hostName.split(" ")[0]} — I'll be at ${e.name}. would love to say hi.`
        : undefined,
      contact: hostId
        ? { id: hostId, name: hostName || hostId, avatar: data.people[hostId]?.avatar }
        : { name: e.name },
    };
  });

  const topFollow = data.following[0];
  if (topFollow && topFollow.events > 0) {
    debriefItems.push({
      name: topFollow.name,
      reason: `most active in your scene — ${topFollow.events} upcoming events. Worth a check-in before the week fills up.`,
      draft: `hey ${topFollow.name.split(" ")[0]} — saw you have a busy week on luma. which one should I not miss?`,
      contact: { id: topFollow.id, name: topFollow.name, avatar: topFollow.avatar },
    });
  }

  return (
    <>
      <SceneBridgeSync
        following={data.following}
        convergingHosts={convergingHosts}
        sceneQs={sceneQs}
        eventCount={totalEvents}
      />

      <TodayBoard weekEvents={weekCount} sceneQs={sceneQs} />

      <FadeIn>
        <div className="os-scene-head">
          <div className="eyebrow">your scene · {totalEvents} events · {cities.length} {cities.length === 1 ? "city" : "cities"}</div>
          <h2>what your people are throwing</h2>
          <p className="sub">Events, hosts and briefs from the organizers you follow. Add anyone to people (CRM) or copy a draft.</p>
        </div>
      </FadeIn>

      <FadeIn delay={0.04}>
        <div className="feature-strip" aria-label="your hub shortcuts">
          <a className="feature-strip-main" href={sceneQs ? `/profile?${sceneQs}` : "/profile"}>
            <span className="feature-strip-kicker">new · top right</span>
            <strong>open your profile hub</strong>
            <span>
              social links · Ticketmaster / Eventbrite / Partiful · communities · agents · CRM
            </span>
          </a>
          <a href={sceneQs ? `/social-scene?${sceneQs}` : "/social-scene"}>the pond</a>
          <a href={sceneQs ? `/social-scene/connections?${sceneQs}` : "/social-scene/connections"}>
            connections
          </a>
          <a href={sceneQs ? `/crm?${sceneQs}` : "/crm"}>CRM</a>
        </div>
      </FadeIn>

      <div className="dash-grid">
        <div className="dash-main">
          <FadeIn delay={0.05}>
            <VeridianDebrief
              title="your brief · this week"
              intro="What Veridian flagged — convergence events and people worth reaching first. Add them to CRM or copy a draft."
              items={debriefItems}
            />
          </FadeIn>

          <FadeIn delay={0.08}>
            <h2 className="dash-section-title">this week</h2>
            {weekEvents.length > 0 ? (
              <EventTimeline events={weekEvents} people={data.people} />
            ) : (
              <p className="sub">nothing on the calendar yet — add follows or cities.</p>
            )}
          </FadeIn>

          <FadeIn delay={0.1}>
            <h2 className="dash-section-title">📍 your cities</h2>
          </FadeIn>
          <StaggerList className="city-grid">
            {cities.map((c) => {
              const evs = data.groups[c] || [];
              const featured = evs.filter((e) => e.overlap > 1);
              const top = evs[0];
              return (
                <a key={c} className="city-card" href={cityHrefs[c]}>
                  <div className="city-name">{c}</div>
                  <div className="count">{evs.length}</div>
                  <div className="count-label">{evs.length === 1 ? "upcoming event" : "upcoming events"}</div>
                  <div className="signal">
                    {featured.length > 0 ? (
                      <>
                        <span className="hot">🔥 {featured.length} {featured.length === 1 ? "event has" : "events have"} 2+ of your follows</span>
                        {top && <div style={{ marginTop: 6, color: "var(--ink-soft)" }}>top: <strong>{top.name}</strong></div>}
                      </>
                    ) : top ? (
                      <>next up: <strong style={{ color: "var(--ink-soft)" }}>{top.name}</strong></>
                    ) : (
                      "nothing on the calendar yet"
                    )}
                  </div>
                </a>
              );
            })}
          </StaggerList>

          {data.elsewhere.length > 0 && (
            <FadeIn delay={0.08}>
              <h2 className="dash-section-title">✈️ outside your cities</h2>
              <p className="sub" style={{ marginBottom: 12 }}>
                your follows are throwing {data.elsewhere.length} events in other places.
              </p>
              <EventTimeline events={data.elsewhere.slice(0, 6)} people={data.people} />
            </FadeIn>
          )}
        </div>

        <aside className="dash-rail" aria-label="assistant rail">
          <FadeIn delay={0.06}>
            <CalendarCard sceneQs={sceneQs} />
          </FadeIn>
          <FadeIn delay={0.08}>
            <CrmPipelineCard sceneQs={sceneQs} convergingHosts={convergingHosts} />
          </FadeIn>
          <FadeIn delay={0.1}>
            <AddHost currentFollows={follows} currentCities={cities} />
          </FadeIn>
          <FadeIn delay={0.12}>
            <section className="follows-section rail-follows" aria-label="who you follow">
              <div className="follows-head">
                <h2>who you follow</h2>
                <span className="count-inline">{data.following.length}</span>
              </div>
              <FollowsWithChat following={data.following} />
            </section>
          </FadeIn>
        </aside>
      </div>

      {data.skipped.length > 0 && (
        <details className="skipped">
          <summary>{data.skipped.length} {data.skipped.length === 1 ? "follow was" : "follows were"} skipped</summary>
          <ul>
            {data.skipped.map((s, i) => (
              <li key={i}><code>{s.who}</code> — {s.why}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
