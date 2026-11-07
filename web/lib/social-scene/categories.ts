import type { OfferingCategory } from "./types";

export const OFFERING_CATEGORIES: {
  id: OfferingCategory;
  label: string;
  blurb: string;
}[] = [
  { id: "food_bev", label: "food & drink", blurb: "cafés, supper clubs, bars" },
  { id: "fitness_wellness", label: "fitness & wellness", blurb: "yoga, training, recovery" },
  { id: "arts_culture", label: "arts & culture", blurb: "galleries, music, makers" },
  { id: "professional", label: "professional", blurb: "services, freelancers, studios" },
  { id: "tech", label: "tech", blurb: "builders, AI, startups" },
  { id: "education", label: "education", blurb: "workshops, cohorts, tutors" },
  { id: "nonprofit", label: "nonprofit", blurb: "causes and community orgs" },
  { id: "enterprise", label: "enterprise", blurb: "F500, large teams, campuses" },
  { id: "other_legal", label: "other (legal)", blurb: "any lawful business or community" },
];

export function categoryLabel(id: OfferingCategory): string {
  return OFFERING_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}
