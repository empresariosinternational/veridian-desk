import type { NormalizedEvent } from "./types";
import type { EventRole, SceneEventRef, Visibility } from "@/lib/social-scene/types";
import { newId } from "@/lib/social-scene/store";

export function normalizedToSceneRef(
  e: NormalizedEvent,
  role: EventRole,
  visibility: Visibility = "public",
): SceneEventRef {
  const source =
    e.provider === "luma" ||
    e.provider === "ticketmaster" ||
    e.provider === "eventbrite" ||
    e.provider === "partiful"
      ? e.provider
      : "manual";
  return {
    id: newId("eref"),
    eventId: e.id,
    name: e.name,
    url: e.url,
    start: e.start,
    city: e.city,
    role,
    visibility,
    source,
    addedAt: new Date().toISOString(),
  };
}
