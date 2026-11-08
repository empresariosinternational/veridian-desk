import { buildDigestCached } from "@/lib/luma";
import { getServerSessionKey } from "@/lib/luma-session";
import { parseParams } from "@/lib/defaults";
import { SceneBridgeSync } from "@/components/SceneBridge";
import FadeIn from "@/components/motion/FadeIn";
import VeridianMark from "@/components/VeridianMark";
import CrmWorkspace from "@/components/crm/CrmWorkspace";

export const revalidate = 1800;

type SP = Promise<Record<string, string | undefined>>;

export default async function CrmPage({ searchParams }: { searchParams: SP }) {
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

  const allEvents = [...Object.values(data.groups).flat(), ...data.elsewhere];
  const convergingHosts = allEvents
    .filter((e) => e.overlap > 1)
    .slice(0, 4)
    .flatMap((e) =>
      e.host_ids.slice(0, 1).map((id) => ({
        id,
        name: data.people[id]?.name || id,
        eventName: e.name,
        overlap: e.overlap,
      })),
    );

  return (
    <>
      <SceneBridgeSync
        following={data.following}
        convergingHosts={convergingHosts}
        sceneQs={sceneQs}
        eventCount={data.totals.events}
      />

      <FadeIn>
        <div className="dash-hero-brand" style={{ marginBottom: 8 }}>
          <VeridianMark size={18} />
          <span className="veridian-tag">veridian</span>
        </div>
        <div className="eyebrow">People</div>
        <h1>Everyone Tidepath works with, in one place</h1>
        <p className="sub" style={{ marginTop: 8 }}>
          Donors, families, volunteers and partners. Nobody gets typed in twice: say something about a person on the desk and their record updates.
        </p>
      </FadeIn>

      <FadeIn delay={0.03}>
        <div className="vh-grid" style={{ marginTop: 20 }}>
          {[
            { who: "Donors", what: "María and Maria González were two records. Now one, with every gift counted once.", href: "/desk?tour=2", cta: "See the donor list" },
            { who: "Families", what: "The Jean-Baptiste household prefers Creole and evening calls. It's on Marisol's call list.", href: "/desk?tour=1", cta: "See this week's calls" },
            { who: "Volunteers", what: "When a driver is needed today, the volunteer who already drives that area is asked first.", href: "/desk?tour=5", cta: "See open shifts" },
            { who: "Private notes", what: "Counseling notes stay with the counselor. Funders only see that a session happened.", href: "/desk?tour=4", cta: "See how it stays private" },
          ].map((c) => (
            <a key={c.who} className="vh-card" href={c.href}>
              <div className="vh-who"><strong>{c.who}</strong></div>
              <div className="vh-gets">{c.what}</div>
              <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600, color: "#6335BE" }}>{c.cta} →</div>
            </a>
          ))}
        </div>
        <h2 className="vh-title" style={{ marginTop: 28 }}>Your own contacts</h2>
        <p className="sub">Add anyone else you want to keep track of. They stay in this browser only.</p>
      </FadeIn>

      <FadeIn delay={0.06}>
        <CrmWorkspace
          following={data.following}
          people={data.people}
          events={allEvents}
        />
      </FadeIn>
    </>
  );
}
