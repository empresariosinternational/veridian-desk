// Default seed data for the unparameterized landing (luma-scene.vercel.app/).
export const DEFAULT_CITIES = ["Miami", "San Francisco"];

export const DEFAULT_ALIASES: Record<string, string[]> = {
  Miami: ["Coral Gables", "Doral", "Wynwood", "Brickell", "Aventura", "North Miami", "South Miami", "Hialeah", "Key Biscayne", "Miami Beach", "Miami Lakes"],
  "San Francisco": ["SF", "Oakland", "Berkeley"],
};

export const DEFAULT_FOLLOWS = [
  "usr-GtDfOEE2pgFu5VI",
  "usr-WfuWFhkUKt2JWux",
  "usr-6TsV22Thu34yt1N",
  "usr-qV2fYN3zhqh7H2d",
  "usr-d6WjRPUH5veGHAx",
  "usr-HibqQJ9ixesUZeo",
  "usr-Sixs4X5XSYAjDXB",
  "usr-qSSSI0lHxxE27fy",
  "usr-EUDlDnRil6v5zfM",
  "usr-vZ7w2FE5gUi7f1Y",
  "usr-7g0bDxuPXxmNPw1",
  "usr-HL2S0aMay1jlIjn",
];

// Convert ?cities=a,b&follows=x,y URL params (or fallback to defaults).
export function parseParams(sp: Record<string, string | undefined>): { cities: string[]; follows: string[]; aliases: Record<string, string[]> } {
  const cities = sp.cities?.split(",").map((s) => s.trim()).filter(Boolean) ?? DEFAULT_CITIES;
  const follows = sp.follows?.split(",").map((s) => s.trim()).filter(Boolean) ?? DEFAULT_FOLLOWS;
  // Only ship Miami/SF aliases if the cities match; otherwise empty.
  const aliases: Record<string, string[]> = {};
  for (const c of cities) {
    if (DEFAULT_ALIASES[c]) aliases[c] = DEFAULT_ALIASES[c];
  }
  return { cities, follows, aliases };
}

export function fmtTime(iso: string | null, tz?: string | null): string {
  if (!iso) return "TBD";
  const d = new Date(iso);
  return d.toLocaleString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz || undefined });
}

export function citySlug(c: string): string {
  return c.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function whyFeatured(overlap: number, hostCount: number, attendeeCount: number): string | null {
  if (overlap < 2) return null;
  if (hostCount >= 2 && attendeeCount > 0) return `${hostCount} of your follows co-hosting + ${attendeeCount} attending`;
  if (hostCount >= 2) return `${hostCount} of your follows are co-hosting`;
  if (attendeeCount >= 2) return `${attendeeCount} of your follows are going`;
  return `${overlap} of your follows involved`;
}
