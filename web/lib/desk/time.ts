/** Date helpers. The desk runs on Miami time; dates are plain YYYY-MM-DD strings. */

export const DESK_TZ = "America/New_York";

/** Give Miami Day 2026 — the 15th edition. */
export const GIVE_MIAMI_DAY = "2026-11-19";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

export function todayISO(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DESK_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function toUTC(iso: string): number {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  return fromUTC(toUTC(iso) + n * 86_400_000);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toUTC(toIso) - toUTC(fromIso)) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayOf(iso: string): number {
  return new Date(toUTC(iso)).getUTCDay();
}

export function weekdayIndex(name: string): number {
  return WEEKDAYS.indexOf(name.toLowerCase());
}

export function monthIndex(name: string): number {
  const n = name.toLowerCase();
  return MONTHS.findIndex((m) => m === n || m.slice(0, 3) === n.slice(0, 3));
}

/** Next date with this weekday, strictly after today ("on Thursday"). */
export function nextWeekday(today: string, wd: number): string {
  let d = addDays(today, 1);
  while (weekdayOf(d) !== wd) d = addDays(d, 1);
  return d;
}

/** Most recent date with this weekday, strictly before today ("missed … on Tuesday"). */
export function lastWeekday(today: string, wd: number): string {
  let d = addDays(today, -1);
  while (weekdayOf(d) !== wd) d = addDays(d, -1);
  return d;
}

/** "This week" for a call list: the coming Friday (today if it is Friday). */
export function endOfWorkWeek(today: string): string {
  let d = today;
  while (weekdayOf(d) !== 5) d = addDays(d, 1);
  return d;
}

export function isWeekend(iso: string): boolean {
  const wd = weekdayOf(iso);
  return wd === 0 || wd === 6;
}

/** "Thu, Nov 12" */
export function fmtDay(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(toUTC(iso)));
}

/** "Mar 3, 2026" */
export function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(toUTC(iso)));
}

/** "2:41 PM" in Miami time. */
export function fmtTime(isoTimestamp: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: DESK_TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(isoTimestamp));
}

export function giveMiamiDay(today: string): { date: string; daysAway: number; label: string } {
  const daysAway = daysBetween(today, GIVE_MIAMI_DAY);
  const when =
    daysAway > 1 ? `${daysAway} days away` : daysAway === 1 ? "tomorrow" : daysAway === 0 ? "today" : "passed";
  return { date: GIVE_MIAMI_DAY, daysAway, label: `Give Miami Day is ${fmtDay(GIVE_MIAMI_DAY)} — ${when}` };
}
