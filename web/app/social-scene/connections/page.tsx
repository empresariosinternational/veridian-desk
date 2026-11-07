import FadeIn from "@/components/motion/FadeIn";
import VeridianMark from "@/components/VeridianMark";
import { listProviderStatuses } from "@/lib/providers/registry";
import ConnectionsClient from "@/components/social-scene/ConnectionsClient";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | undefined>>;

export default async function ConnectionsPage({ searchParams }: { searchParams: SP }) {
  const spRaw = await searchParams;
  const sp: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(spRaw)) sp[k] = Array.isArray(v) ? (v as any)[0] : (v as any);
  const sceneQs = new URLSearchParams({
    ...(sp.cities ? { cities: sp.cities } : {}),
    ...(sp.follows ? { follows: sp.follows } : {}),
  }).toString();

  const providers = listProviderStatuses();

  return (
    <>
      <FadeIn>
        <div className="dash-hero-brand" style={{ marginBottom: 8 }}>
          <VeridianMark size={18} />
          <span className="veridian-tag">connections</span>
        </div>
        <div className="eyebrow">event apps · social profiles</div>
        <h1>connections</h1>
        <p className="sub" style={{ marginTop: 8 }}>
          plug Ticketmaster, Eventbrite, and Partiful into the same fabric as Luma — and attach social
          profiles for agent personalization.{" "}
          <a className="inline-link" href={sceneQs ? `/social-scene?${sceneQs}` : "/social-scene"}>
            ← social scene
          </a>
        </p>
      </FadeIn>
      <FadeIn delay={0.05}>
        <ConnectionsClient providers={providers} sceneQs={sceneQs} />
      </FadeIn>
    </>
  );
}
