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
        <div className="eyebrow">network · on-device</div>
        <h1>CRM</h1>
        <p className="sub" style={{ marginTop: 8 }}>
          manage BD for events and your scene. contacts stay in your browser — export anytime.{" "}
          <a className="inline-link" href={sceneQs ? `/?${sceneQs}` : "/"}>
            ← dashboard
          </a>
        </p>
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
