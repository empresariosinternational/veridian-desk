import { buildDigestCached } from "@/lib/luma";
import { getServerSessionKey } from "@/lib/luma-session";
import { parseParams } from "@/lib/defaults";
import { listProviderStatuses } from "@/lib/providers/registry";
import FadeIn from "@/components/motion/FadeIn";
import ProfileHub from "@/components/ProfileHub";

export const revalidate = 1800;

type SP = Promise<Record<string, string | undefined>>;

export default async function ProfilePage({ searchParams }: { searchParams: SP }) {
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
    <FadeIn>
      <ProfileHub
        digest={digest}
        sceneQs={sceneQs}
        providers={listProviderStatuses()}
      />
    </FadeIn>
  );
}
