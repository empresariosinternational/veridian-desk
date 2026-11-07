import type { Community } from "@/lib/social-scene";
import { categoryLabel } from "@/lib/social-scene";

type Props = {
  community: Community;
  href: string;
};

export default function CommunityCard({ community, href }: Props) {
  return (
    <a className="ss-card" href={href}>
      <div className="ss-card-top">
        <span className="ss-heat">heat {Math.round(community.heat)}</span>
        <span className="ss-vis">{community.visibility}</span>
      </div>
      <h3 className="ss-card-title">{community.name}</h3>
      <p className="ss-card-tag">{community.tagline || "community in the pond"}</p>
      <div className="ss-card-meta">
        {community.city && <span>{community.city}</span>}
        <span>{community.eventRefs.length} events</span>
      </div>
      {community.categories.length > 0 && (
        <div className="ss-chips">
          {community.categories.slice(0, 3).map((c) => (
            <span key={c} className="ss-chip">
              {categoryLabel(c)}
            </span>
          ))}
        </div>
      )}
    </a>
  );
}
