# Veridian Desk

**Say it once. The desk files it, routes the urgent thing the same day, and keeps private things private.**

Veridian Desk is a GPT-powered assistant for nonprofits, communities, and the people in them. Chat with the desk, plan the day's executive tasks, or say a fact once and file it. OpenAI handles chat, planning, transcription, and spoken confirmations. The desk merges duplicate donors, turns workshop requests into approval checklists, keeps counseling detail out of funder reports, and drafts grant updates from a truth ledger. The same network staffs shifts and proposes public needs for both communities to approve.

Built at the DevDay Exchange · Codex Hackathon for Miami's Non-Profits (The LAB Miami, Nov 7–8, 2026) for the six Tidepath Family Alliance challenges and the Mangrove Mews bonus. Veridian is the assistant layer; the web app around it is Agentscene. All people, organizations, schools, donors and amounts in the demo are fictional.

## Run it

```bash
cd web
npm install
cp .env.example .env.local     # set OPENAI_API_KEY here, or export it in your shell
npm run dev -- -H 0.0.0.0      # http://localhost:3000/desk
npm run desk:smoke             # runs the whole demo offline and checks it
npm run desk:test              # OpenAI integration tests using a local API fixture
```

On Vercel, keep the project root at `web/` and set the server-side `OPENAI_API_KEY` environment variable. The same name works locally and in the hosted app. No browser key or `NEXT_PUBLIC_` key is needed. Redeploy after changing hosted environment variables.

Open `/desk` and select a profile. **Chat** supports follow-up questions with a separate conversation per profile. **Plan my day** proposes prioritized tasks with owners, dates, and approval requirements from current desk work. **File a note** updates boards through validated tools. Chat and planning do not file notes or execute proposed tasks; existing approval controls handle offers, workshops, and network matches.

Only `OPENAI_API_KEY` is required. Optional defaults in `web/.env.example` are `OPENAI_MODEL=gpt-4.1-mini`, `OPENAI_TRANSCRIBE_MODEL=gpt-transcribe`, `OPENAI_VOICE_MODEL=gpt-realtime-2.1-mini`, and `OPENAI_VOICE=marin`. The chat model must support the Responses API and Structured Outputs; the voice model must support Realtime audio output.

No key or an upstream outage? Filing still uses the offline desk rules and clearly labels the fallback. Chat and planning show an error without creating records. Spoken-confirmation failures leave successfully filed work intact.

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
  → POST /api/desk/hear      OpenAI gpt-transcribe (text skips transcription)
  → web/lib/desk/planner.ts  GPT Responses API → validated chat / executive plan / filing actions
  → web/lib/desk/agent.ts    executes a validated filing plan, or offline rules on provider failure
  → web/lib/desk/tools.ts    plain functions file the work, keyed so nothing doubles
  → web/data/desk-state.json one JSON file; no database, no login
  → OpenAI Realtime         speaks one short confirmation for voice/demo input
  → /desk                    the board in front changes with the speaker
```

- **Say it once.** Every utterance is keyed by normalized text + speaker + day, and every fact it writes has its own key, so a reworded repeat says “Already filed”.
- **Truth ledger.** Grant and quarterly text may only carry figures that exist in the ledger (`web/lib/desk/ledger.ts`).
- **Data classes.** `PUBLIC_COMMUNITY`, `OPERATIONAL`, `DONOR`, `CLINICAL`. Only `PUBLIC_COMMUNITY` crosses between organizations. Its text is built from structured fields and re-checked for names, counseling content, amounts and addresses (`web/lib/desk/privacy.ts`).
- **Consent.** No always-on microphone. Audio is accepted only after Arm, while push-to-talk is held; it goes to OpenAI and is not stored by the desk. Spoken confirmations use an AI-generated voice. Matches stay pending until both orgs accept, and shift offers until the person accepts.
- **Model context.** GPT receives the current request, bounded conversation history, and relevant desk work. Stored clinical notes, family records, donor emails, and gift amounts are excluded. The Responses API uses `store: false`. History stays in browser memory and is cleared by reload or demo reset.
- **Learning, honestly.** One remembered preference: Marisol's call list grouped by school.
- **Haitian Creole.** Live Creole audio has not been verified for this demo; staff can enter notes as text.

The implementation follows the official [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [file transcription](https://developers.openai.com/api/docs/guides/speech-to-text), and [Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations) documentation.

## Hardware

An optional MicroPython node (Pico W or ESP32) with parts from the SunFounder Universal Maker Sensor Kit: a button to arm, an RGB or traffic-light LED, an SSD1306 OLED, a PIR for “someone is at the desk”, and a buzzer for urgent cards. See [firmware/README.md](firmware/README.md). Without a board, the on-screen node is the device.

## Docs

- [docs/hackathon/DEMO-SCRIPT.md](docs/hackathon/DEMO-SCRIPT.md) — the 4-minute demo, Q&A moves, failure modes.
- [docs/hackathon/MASTER-PROMPT-VERIDIAN-DESK.md](docs/hackathon/MASTER-PROMPT-VERIDIAN-DESK.md) — the build spec.
- [docs/node-clip.md](docs/node-clip.md) — the consent state machine the node follows.

## License

MIT — see [LICENSE](LICENSE).
