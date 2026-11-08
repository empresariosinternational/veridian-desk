import TodayBoard from "@/components/os/TodayBoard";
import FadeIn from "@/components/motion/FadeIn";

const PEOPLE = [
  { who: "Marisol", role: "Program manager", says: "“Jordan missed mentoring. Call his mom this week.”", gets: "The call lands on her list and in the quarterly report. Nobody retypes it.", step: 1 },
  { who: "Denise", role: "Fundraising", says: "“Maria is on the donor list twice.”", gets: "One donor, gifts counted once, flagged before Give Miami Day.", step: 2 },
  { who: "Yesenia", role: "Front desk", says: "“Edison Elementary wants a workshop Thursday, in Spanish.”", gets: "A confirmed workshop card with an owner on every step.", step: 3 },
  { who: "Reginald", role: "Counselor", says: "“Session note: Jordan talked about panic before school.”", gets: "Stored once as private. The funder only sees “session completed”.", step: 4 },
  { who: "Owen", role: "Volunteers", says: "“We need a driver in West Little River today.”", gets: "Urgent shift opens and goes to the one volunteer who drives there.", step: 5 },
  { who: "Claudette", role: "Director", says: "“Draft the county quarterly update. Only what is true.”", gets: "A grant report where every number traces back to a real record.", step: 6 },
];

export default function Home() {
  return (
    <>
      <FadeIn>
        <section className="vh-hero" aria-label="what Veridian Desk does">
          <div className="vh-kicker">Veridian Desk · for Tidepath and the groups around it</div>
          <h1>Say it once. The desk files it, tells the right person, and keeps private things private.</h1>
          <p>
            Nine staff and 40 volunteers retype the same facts into spreadsheets, group chats and grant reports.
            Here, anyone says a fact once, by voice or text, in English or Spanish.
          </p>
          <div className="vh-actions">
            <a className="vh-primary" href="/desk?tour=0">Watch it work · 2 min</a>
            <a className="vh-secondary" href="/desk">Try it yourself</a>
          </div>
        </section>
      </FadeIn>

      <FadeIn delay={0.04}>
        <h2 className="vh-title">Tap a person to see what changes</h2>
        <div className="vh-grid">
          {PEOPLE.map((p) => (
            <a key={p.who} className="vh-card" href={`/desk?tour=${p.step}`}>
              <div className="vh-who"><strong>{p.who}</strong><span>{p.role}</span></div>
              <div className="vh-says">{p.says}</div>
              <div className="vh-gets">{p.gets}</div>
            </a>
          ))}
        </div>
      </FadeIn>

      <FadeIn delay={0.08}>
        <h2 className="vh-title">Today at Tidepath</h2>
        <TodayBoard weekEvents={0} sceneQs="" />
      </FadeIn>
    </>
  );
}
