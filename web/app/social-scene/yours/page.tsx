import { buildDigestCached } from "@/lib/luma";
import { getServerSessionKey } from "@/lib/luma-session";
import { parseParams } from "@/lib/defaults";
import FadeIn from "@/components/motion/FadeIn";
import VeridianMark from "@/components/VeridianMark";
import SocialSceneWorkspace from "@/components/social-scene/SocialSceneWorkspace";

export const revalidate = 1800;

type SP = Promise<Record<string, string | undefined>>;

export default async function YourSocialScenePage({ searchParams }: { searchParams: SP }) {
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
      <FadeIn>
        <div className="dash-hero-brand" style={{ marginBottom: 8 }}>
          <VeridianMark size={18} />
          <span className="veridian-tag">your social scene</span>
        </div>
        <div className="eyebrow">personal marketplace schedule</div>
        <h1>your social scene</h1>
        <p className="sub" style={{ marginTop: 8 }}>
          like your scene — but for communities you curate, events you host or attend, and agents
          working your goals.
        </p>
      </FadeIn>
      <FadeIn delay={0.05}>
        <SocialSceneWorkspace digest={digest} sceneQs={sceneQs} mode="yours" />
      </FadeIn>
    </>
  );
}
