# Veridian Desk

**Say it once. The desk files it, routes the urgent thing the same day, and keeps private things private.**

Veridian Desk is a push-to-talk assistant for nonprofits, communities, and the people in them. Staff and neighbors say each fact once. Deepgram hears them and speaks the confirmation. The desk files the note, merges a duplicate donor before Give Miami Day, turns a workshop request into an approval checklist, keeps counseling detail out of the funder report, and drafts a grant update from a truth ledger. The same network staffs a shift, recruits a person who already offered to help, and lets a second community accept a public same-day need. A sensor node shows when the desk is listening. Voice is Deepgram.

Built at the DevDay Exchange · Codex Hackathon for Miami's Non-Profits (The LAB Miami, Nov 7–8, 2026) for the six Tidepath Family Alliance challenges and the Mangrove Mews bonus. Veridian is the assistant layer; the web app around it is Agentscene. All people, organizations, schools, donors and amounts in the demo are fictional.

## Run it

```bash
cd web
npm install
cp .env.example .env.local     # put DEEPGRAM_API_KEY here, and only here
npm run dev -- -H 0.0.0.0      # http://localhost:3000/desk
npm run desk:smoke             # runs the whole demo offline and checks it
```

No key? The desk still runs. Every line files by desk rules and says *voice skipped*.

## One desk, two sides

| Challenge | Who | What one sentence does |
|---|---|---|
| Sign-up to quarterly report | Marisol | Case note filed once, the child on this week's call list, the quarterly report updated from the ledger. |
| Duplicate and lapsed donors | Denise | “María / Maria González” merges into one record, each gift counted once, and she lands on the “call before Give Miami Day” list. |
| Request to approved workshop | Yesenia | A workshop card with school, date, language, `slides-pending` and an owner for every next step. |
| Counseling notes typed twice | Reginald | The note is stored once as CLINICAL. Funders get a server-side projection: “School-based counseling session completed” plus a ledger id. |
| Hours lost in group chats | Owen | Hours counted once. A same-day driver shift opens, routed to Owen as urgent, and is offered to the one person who already offered to drive. |
| Grants that sound like us and say only what's true | Claudette | A draft in Tidepath's plain voice where every figure cites the truth ledger and the spend line states the funder's rule. Any other number is stripped. |
| Colony updates scattered across chats (bonus) | Beatriz | Colony status becomes a public card the same day, and a matching public need from Tidepath is proposed for dual consent. |
| People (B2C) | Luis, Ana | Personal desks: their notes and hours, the shift they match and why, with Accept and a no-penalty Decline. |

## How it works

```
mic (push-to-talk, after Arm) or a scripted line
  → POST /api/desk/hear      Deepgram nova-3 transcribes (scripted text skips this)
  → web/lib/desk/agent.ts    speaker + language → plan (rules, no model)
  → web/lib/desk/tools.ts    plain functions file the work, keyed so nothing doubles
  → web/data/desk-state.json one JSON file; no database, no login
  → Deepgram Aura-2          speaks one short confirmation
  → /desk                    the board in front changes with the speaker
```

- **Say it once.** Every utterance is keyed by normalized text + speaker + day, and every fact it writes has its own key, so a reworded repeat says “Already filed”.
- **Truth ledger.** Grant and quarterly text may only carry figures that exist in the ledger (`web/lib/desk/ledger.ts`).
- **Data classes.** `PUBLIC_COMMUNITY`, `OPERATIONAL`, `DONOR`, `CLINICAL`. Only `PUBLIC_COMMUNITY` crosses between organizations. Its text is built from structured fields and re-checked for names, counseling content, amounts and addresses (`web/lib/desk/privacy.ts`).
- **Consent.** No always-on microphone. Audio is accepted only after Arm, while push-to-talk is held; it goes to Deepgram and is dropped. Matches stay pending until both orgs accept, and shift offers until the person accepts.
- **Learning, honestly.** One remembered preference: Marisol's call list grouped by school.
- **Haitian Creole.** No Deepgram speech-to-text model lists `ht`, so Creole notes are entered by staff.

## Hardware

An optional MicroPython node (Pico W or ESP32) with parts from the SunFounder Universal Maker Sensor Kit: a button to arm, an RGB or traffic-light LED, an SSD1306 OLED, a PIR for “someone is at the desk”, and a buzzer for urgent cards. See [firmware/README.md](firmware/README.md). Without a board, the on-screen node is the device.

## Docs

- [docs/hackathon/DEMO-SCRIPT.md](docs/hackathon/DEMO-SCRIPT.md) — the 4-minute demo, Q&A moves, failure modes.
- [docs/hackathon/MASTER-PROMPT-VERIDIAN-DESK.md](docs/hackathon/MASTER-PROMPT-VERIDIAN-DESK.md) — the build spec.
- [docs/node-clip.md](docs/node-clip.md) — the consent state machine the node follows.

## License

MIT — see [LICENSE](LICENSE).
