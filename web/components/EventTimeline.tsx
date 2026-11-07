import type { EventRow } from "@/lib/luma";
import { fmtTime, whyFeatured } from "@/lib/defaults";
import { groupEventsByDay } from "@/lib/timeline";
import { googleCalendarTemplateUrl } from "@/lib/gcal";

type Props = {
  events: EventRow[];
  people: Record<string, { name: string; avatar?: string | null }>;
  /** Show "add to calendar" on each event */
  showAddToCalendar?: boolean;
};

export default function EventTimeline({ events, people, showAddToCalendar = true }: Props) {
  const days = groupEventsByDay(events);
  if (days.length === 0) return null;

  return (
    <div className="event-timeline">
      <div className="timeline-spine" aria-hidden="true" />
      {days.map((day) => (
        <section key={day.key} className="timeline-day">
          <div className="timeline-date">
            <div className="timeline-label">{day.label.primary}</div>
            {day.label.secondary && (
              <div className="timeline-weekday">{day.label.secondary}</div>
            )}
          </div>
          <div className="timeline-marker">
            <span className="timeline-dot" />
          </div>
          <div className="timeline-events">
            {day.events.map((e) => {
              const hostNames = e.host_ids.map((id) => people[id]?.name || id).join(", ");
              const featured = e.overlap > 1;
              const reason = featured ? whyFeatured(e.overlap, e.host_ids.length, e.attendee_ids.length) : null;
              const calUrl = googleCalendarTemplateUrl({
                title: e.name,
                start: e.start,
                details: e.url ? `Luma: ${e.url}` : undefined,
                location: e.address || e.city || undefined,
              });
              return (
                <div key={e.id} className={`event-wrap${featured ? " featured" : ""}`}>
                  <a
                    className={`event${featured ? " featured" : ""}`}
                    href={e.url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {reason && <div className="insight">⚡ {reason}</div>}
                    <div className="event-time">{fmtTime(e.start, e.tz)}</div>
                    <h3>{e.name}</h3>
                    <div className="where">{e.city || "TBD"}</div>
                    <div className="hosted-by">
                      <span className="label">hosted by</span>
                      {hostNames}
                    </div>
                  </a>
                  {showAddToCalendar && (
                    <a
                      className="event-cal-btn"
                      href={calUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      + calendar
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
