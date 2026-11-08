"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import css from "./JudgeTour.module.css";

/** The tour asks the desk to run a demo line. DeskConsole listens for this event. */
export const TOUR_RUN_EVENT = "veridian:tour-run";
export const TOUR_READY_EVENT = "veridian:desk-ready";

type Step = {
  kicker: string;
  title: string;
  body: string;
  look?: string;
  run?: string;
  cta?: string;
};

const STEPS: Step[] = [
  {
    kicker: "Welcome · 2-minute tour",
    title: "Say it once. The desk does the rest.",
    body:
      "Tidepath's nine staff and 40 volunteers retype the same facts into spreadsheets, group chats and grant reports. Veridian Desk lets anyone say a fact once, by voice or text. It files it in the right place, sends the urgent part to the right person the same day, and keeps private details private.",
    look: "Each step below runs one real sentence through the same pipeline as the microphone, so you can watch the board change. Nothing is pre-recorded.",
    cta: "Start the tour",
  },
  {
    kicker: "Challenge 1 · Marisol, program manager",
    title: "Type each thing once. Know which kids need a call.",
    body: "Marisol says: “Jordan missed mentoring on Tuesday. Call his mom this week.”",
    look: "Look at Calls this week: Jordan's mom is due Friday, and the quarterly report's follow-up count goes up by one on its own. Nobody retypes it.",
    run: "marisol",
  },
  {
    kicker: "Challenge 2 · Denise, fundraising",
    title: "Each donor on the list once. Late gifts caught in time.",
    body: "Denise says: “Maria Gonzalez is on the donor list twice and has not given since March.”",
    look: "Look at Donors: the two records merge into one, the shared gift counts once, and María lands on the “call before Give Miami Day” list.",
    run: "denise",
  },
  {
    kicker: "Challenge 3 · Yesenia, front desk",
    title: "Every request becomes a confirmed workshop.",
    body: "Yesenia says: “Edison Elementary wants a safety workshop on Thursday in Spanish.”",
    look: "Look at Workshops: a card with the school, date and language, slides marked pending until the school approves, and an owner on every next step.",
    run: "yesenia",
  },
  {
    kicker: "Challenge 4 · Reginald, counselor",
    title: "Write the note once. The funder sees only what it needs.",
    body: "Reginald says: “Session note: Jordan talked about panic before school. Funder does not need that detail.”",
    look: "Look at Counseling notes: the note is stored once as clinical. Press Funder view and all the funder gets is “School-based counseling session completed”. The server removes the rest; it is not just hidden on screen.",
    run: "reginald",
  },
  {
    kicker: "Challenge 5 · Owen, volunteers",
    title: "Every hour counted once. Urgent needs routed the same day.",
    body: "Owen says: “Ana volunteered 3 hours yesterday. We need a driver in West Little River today.”",
    look: "Look at Staffing: Ana's 3 hours count once, a same-day driver shift opens marked urgent for Owen, and it is offered to Luis, the one volunteer who already offered to drive there.",
    run: "owen",
  },
  {
    kicker: "Challenge 6 · Claudette, director",
    title: "Grant reports that sound like us and say only what's true.",
    body: "Claudette says: “Draft the county quarterly update. Only what is true.”",
    look: "Look at Grants: every number in the draft points to a line in the truth ledger, and the spending rule from the funder is stated. Press “Try to add a number” on that board: any figure that is not in the ledger is removed.",
    run: "claudette",
  },
  {
    kicker: "Bonus · Beatriz, Mangrove Mews cat rescue",
    title: "Every colony's status known the same day.",
    body: "Beatriz says: “Colony B needs food today.”",
    look: "Look at Colonies and Network: Colony B becomes a public card right away, and the desk suggests pairing it with Tidepath's driver run. Nothing is shared until both groups accept, and only public details ever cross between them.",
    run: "beatriz",
  },
  {
    kicker: "The person side · Luis, a neighbor",
    title: "Volunteers get asked for the right thing, and can say no.",
    body: "Scroll to Luis Ortega's desk. He sees the driver shift and one sentence on why he was asked.",
    look: "Press Accept and Tidepath's staffing board shows the shift filled. Decline costs him nothing. He can also speak Spanish: “Soy Luis. Hoy puedo manejar en West Little River.”",
    run: "luis-es",
  },
  {
    kicker: "Proof · nothing doubles",
    title: "Say the same thing twice.",
    body: "Run Marisol's sentence again.",
    look: "The desk answers “Already filed.” Reworded repeats are caught too, so hours, gifts and calls are never counted twice.",
    run: "marisol",
  },
  {
    kicker: "Your turn",
    title: "Try it with your own words.",
    body:
      "Pick any person at the top of the desk and type or say something in the box on the left, in English or Spanish. Use Chat to ask a question, or Plan my day for a prioritized task list. Press Arm, then hold Hold to talk to use the microphone.",
    look: "Say it once. Filed once. The right person and the other community answered the same day.",
    cta: "Finish",
  },
];

const SEEN_KEY = "veridian.judge-tour.seen.v1";

export default function JudgeTour() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [ran, setRan] = useState<Set<number>>(new Set());

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("tour");
    if (fromUrl !== null) {
      setOpen(true);
      const n = Number(fromUrl);
      if (Number.isInteger(n) && n >= 0 && n < STEPS.length) setI(n);
    }
  }, []);

  const fire = useCallback((id: string) => {
    window.dispatchEvent(new CustomEvent(TOUR_RUN_EVENT, { detail: { id } }));
  }, []);

  useEffect(() => {
    if (!pending) return;
    const onReady = () => {
      fire(pending);
      setPending(null);
    };
    window.addEventListener(TOUR_READY_EVENT, onReady);
    return () => window.removeEventListener(TOUR_READY_EVENT, onReady);
  }, [pending, fire]);

  const close = useCallback(() => {
    setOpen(false);
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* storage blocked */
    }
  }, []);

  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  const runStep = useCallback(() => {
    if (!step.run) return;
    setRan((r) => new Set(r).add(i));
    if (pathname !== "/desk") {
      setPending(step.run);
      router.push("/desk");
    } else {
      fire(step.run);
    }
  }, [step, i, pathname, router, fire]);

  const next = useCallback(() => {
    if (last) return close();
    if (i === 0 && pathname !== "/desk") router.push("/desk");
    setI(i + 1);
  }, [i, last, close, pathname, router]);

  if (!open) {
    return (
      <button type="button" className={css.launcher} onClick={() => setOpen(true)} aria-label="Open the 2-minute tour">
        <span className={css.launcherDot} aria-hidden="true" />
        Tour · 2 min
      </button>
    );
  }

  return (
    <aside className={css.panel} role="dialog" aria-label="Guided tour" aria-live="polite">
      <div className={css.head}>
        <span className={css.kicker}>{step.kicker}</span>
        <button type="button" className={css.close} onClick={close} aria-label="Close the tour">×</button>
      </div>
      <h2 className={css.title}>{step.title}</h2>
      <p className={css.body}>{step.body}</p>
      {step.look && <p className={css.look}>{step.look}</p>}
      <div className={css.progress} aria-hidden="true">
        {STEPS.map((_, n) => (
          <span key={n} className={`${css.pip} ${n === i ? css.pipOn : ""} ${n < i ? css.pipDone : ""}`} />
        ))}
      </div>
      <div className={css.actions}>
        {i > 0 && (
          <button type="button" className={css.ghost} onClick={() => setI(i - 1)}>Back</button>
        )}
        {step.run ? (
          <>
            <button type="button" className={css.primary} onClick={runStep}>
              {ran.has(i) ? "Run it again" : "Run it"}
            </button>
            <button type="button" className={css.ghost} onClick={next}>Next</button>
          </>
        ) : (
          <button type="button" className={css.primary} onClick={next}>{step.cta ?? "Next"}</button>
        )}
      </div>
      <span className={css.count}>{i + 1} of {STEPS.length}</span>
    </aside>
  );
}
