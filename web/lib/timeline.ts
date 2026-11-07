import type { EventRow } from "@/lib/luma";

/** Calendar day key (YYYY-MM-DD) in the event's timezone. */
export function eventDayKey(iso: string, tz?: string | null): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz || undefined,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function todayKey(tz?: string | null): string {
  return eventDayKey(new Date().toISOString(), tz);
}

function tomorrowKey(tz?: string | null): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return eventDayKey(d.toISOString(), tz);
}

export type DayLabel = { primary: string; secondary: string };

export function dayLabel(dayKey: string, tz?: string | null): DayLabel {
  const noon = new Date(`${dayKey}T12:00:00`);
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: tz || undefined,
  }).format(noon);

  if (dayKey === todayKey(tz)) return { primary: "Today", secondary: weekday };
  if (dayKey === tomorrowKey(tz)) return { primary: "Tomorrow", secondary: weekday };

  const primary = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: tz || undefined,
  }).format(noon);

  return { primary, secondary: weekday };
}

export type DayGroup = {
  key: string;
  label: DayLabel;
  tz: string | null;
  events: EventRow[];
};

const FAR_FUTURE = "9999";

export function groupEventsByDay(events: EventRow[]): DayGroup[] {
  const sorted = [...events].sort((a, b) =>
    (a.start ?? FAR_FUTURE).localeCompare(b.start ?? FAR_FUTURE),
  );

  const withDate: EventRow[] = [];
  const undated: EventRow[] = [];
  for (const e of sorted) {
    if (e.start) withDate.push(e);
    else undated.push(e);
  }

  const map = new Map<string, { tz: string | null; events: EventRow[] }>();
  for (const e of withDate) {
    const key = eventDayKey(e.start!, e.tz);
    const bucket = map.get(key);
    if (bucket) bucket.events.push(e);
    else map.set(key, { tz: e.tz, events: [e] });
  }

  const groups: DayGroup[] = [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { tz, events: evs }]) => ({
      key,
      label: dayLabel(key, tz),
      tz,
      events: evs,
    }));

  if (undated.length > 0) {
    groups.push({
      key: "tbd",
      label: { primary: "Date TBD", secondary: "" },
      tz: null,
      events: undated,
    });
  }

  return groups;
}
