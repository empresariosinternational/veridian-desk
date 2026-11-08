import { buildDigestCached } from "@/lib/luma";
import { getServerSessionKey } from "@/lib/luma-session";
import { parseParams } from "@/lib/defaults";
import { isSocialSceneEnabled } from "@/lib/social-scene";
import FadeIn from "@/components/motion/FadeIn";
import VeridianMark from "@/components/VeridianMark";
import SocialSceneWorkspace from "@/components/social-scene/SocialSceneWorkspace";
import PondMarketplace from "@/components/os/PondMarketplace";

export const revalidate = 1800;

type SP = Promise<Record<string, string | undefined>>;

export default async function SocialScenePondPage({ searchParams }: { searchParams: SP }) {
  const spRaw = await searchParams;
  const sp: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(spRaw)) sp[k] = Array.isArray(v) ? (v as any)[0] : (v as any);

  const { cities, follows, aliases } = parseParams(sp);
  const sessionKey = await getServerSessionKey();
  const digest = await buildDigestCached({ cities, follows, cityAliases: aliases, sessionKey });
  const sceneQs = new URLSearchParams({
    ...(sp.cities ? { cities: sp.cities } : {}),
    ...(sp.follows ? { follows: sp.follows } : {}),
  }).toString();

  return (
    <>
      <PondMarketplace />
      <FadeIn>
        <div className="os-scene-head">
          <div className="dash-hero-brand" style={{ marginBottom: 8 }}>
            <VeridianMark size={18} />
            <span className="veridian-tag">social scene</span>
          </div>
          <h2>your social scene</h2>
          <p className="sub" style={{ marginTop: 8 }}>
          curate communities, showcase any legal business, and let Veridian + plugged-in agents
          grow your network — from coffee shops to F500.{" "}
          {!isSocialSceneEnabled() && (
            <span className="cal-demo-badge">flag off</span>
          )}
          </p>
        </div>
      </FadeIn>
      <FadeIn delay={0.05}>
        <SocialSceneWorkspace digest={digest} sceneQs={sceneQs} mode="pond" />
      </FadeIn>
    </>
  );
}
