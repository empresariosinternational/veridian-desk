/** Social profile links — attested public URLs, no graph scraping. */

export type SocialNetwork =
  | "instagram"
  | "x"
  | "facebook"
  | "spotify"
  | "linkedin";

export type SocialLink = {
  network: SocialNetwork;
  /** Canonical profile URL */
  url: string;
  /** Normalized handle / path slug when parseable */
  handle: string;
};

export const SOCIAL_NETWORKS: {
  id: SocialNetwork;
  label: string;
  placeholder: string;
}[] = [
  { id: "instagram", label: "Instagram", placeholder: "https://instagram.com/you" },
  { id: "x", label: "X", placeholder: "https://x.com/you" },
  { id: "facebook", label: "Facebook", placeholder: "https://facebook.com/you" },
  { id: "spotify", label: "Spotify", placeholder: "https://open.spotify.com/user/…" },
  { id: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/in/you" },
];

export function normalizeSocialInput(network: SocialNetwork, raw: string): SocialLink | null {
  const s = raw.trim();
  if (!s) return null;

  let url = s;
  let handle = s.replace(/^@/, "");

  const ensureHttps = (u: string) =>
    u.startsWith("http://") || u.startsWith("https://") ? u : `https://${u}`;

  try {
    if (!s.includes(".") && !s.startsWith("http")) {
      // bare handle
      switch (network) {
        case "instagram":
          url = `https://instagram.com/${handle}`;
          break;
        case "x":
          url = `https://x.com/${handle}`;
          break;
        case "facebook":
          url = `https://facebook.com/${handle}`;
          break;
        case "spotify":
          url = `https://open.spotify.com/user/${handle}`;
          break;
        case "linkedin":
          url = `https://linkedin.com/in/${handle}`;
          break;
      }
    } else {
      url = ensureHttps(s);
      const u = new URL(url);
      const parts = u.pathname.split("/").filter(Boolean);
      if (network === "linkedin") {
        const inIdx = parts.indexOf("in");
        handle = inIdx >= 0 ? parts[inIdx + 1] || parts[parts.length - 1] : parts[parts.length - 1] || handle;
      } else if (network === "spotify") {
        const userIdx = parts.indexOf("user");
        const artistIdx = parts.indexOf("artist");
        handle = parts[(userIdx >= 0 ? userIdx : artistIdx) + 1] || parts[parts.length - 1] || handle;
      } else {
        handle = parts[0]?.replace(/^@/, "") || handle;
      }
      // rewrite twitter → x
      if (network === "x" && u.hostname.includes("twitter.com")) {
        url = `https://x.com/${handle}`;
      }
    }
  } catch {
    return null;
  }

  return { network, url, handle: handle.replace(/^@/, "") };
}

export function socialLinksSummary(links: SocialLink[]): string[] {
  return links.map((l) => `${l.network}:${l.handle}`);
}

export function hasNetwork(links: SocialLink[] | undefined, network: SocialNetwork): boolean {
  return Boolean(links?.some((l) => l.network === network));
}
