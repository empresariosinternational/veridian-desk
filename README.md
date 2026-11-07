# Veridian Desk


**Say it once. The desk files it, routes the urgent thing the same day, and keeps private things private.**

Veridian Desk is an assistant for nonprofits, communities, and the people in them. Chat with the desk, plan the day's executive tasks, or say a fact once and file it. The browser handles microphone speech recognition and spoken confirmations with no application API key. OpenAI optionally powers GPT chat and planning. The desk merges duplicate donors, turns workshop requests into approval checklists, keeps counseling detail out of funder reports, and drafts grant updates from a truth ledger. The same network staffs shifts and proposes public needs for both communities to approve.

Built at the DevDay Exchange · Codex Hackathon for Miami's Non-Profits (The LAB Miami, Nov 7–8, 2026) for the six Tidepath Family Alliance challenges and the Mangrove Mews bonus. Veridian is the assistant layer; the web app around it is Agentscene. All people, organizations, schools, donors and amounts in the demo are fictional.

## Run it

```bash
cd web
npm install
npm run dev -- -H 0.0.0.0      # http://localhost:3000/desk
npm run desk:smoke             # runs the whole demo offline and checks it
npm run desk:test              # OpenAI integration tests using a local API fixture
npm run veridian:test          # VCTA chat, task commands, and task validation
```

Voice and desk-rule filing need no key. Open `/desk`, allow microphone access, press **Arm**, then hold **Hold to talk** and release to file. Choose English or Español with **Spoken language**. A browser with Web Speech recognition is required; unsupported browsers can use typed notes and demo buttons. Browser speech services may need a network connection even though the app requires no voice key.

For GPT chat and executive planning, optionally set the server-side `OPENAI_API_KEY` in your shell, `web/.env.local`, or the Vercel project environment. Keep the Vercel project root at `web/`. No browser key or `NEXT_PUBLIC_` key is needed. Redeploy after changing hosted environment variables.

Open `/desk` and select a profile. **Chat** supports follow-up questions with a separate conversation per profile. **Plan my day** proposes prioritized tasks with owners, dates, and approval requirements from current desk work. **File a note** updates boards through validated tools. Chat and planning do not file notes or execute proposed tasks; existing approval controls handle offers, workshops, and network matches.

The only model setting is the optional `OPENAI_MODEL=gpt-4.1-mini` override in `web/.env.example`. The GPT model must support the Responses API and Structured Outputs. Voice uses the browser's built-in speech APIs and available voices.

No OpenAI key or an upstream outage? Voice still works, and filing uses the desk rules. GPT chat and planning on `/desk` show an error without creating records. The VCTA also supports direct task commands without GPT. Browser playback failures leave successfully filed work intact and the written confirmation visible.

## Ask Veridian from any page

**Ask Veridian** is the VCTA in the sticky navigation. It opens a conversation beside the current page, leaving navigation available. Conversation and drafts stay in place while moving through the main navigation or minimizing the panel.

Type a message or hold **Hold to talk**, then release to send. Browser speech recognition and spoken replies need no voice-provider key. **My priorities** lets you add tasks, change priority and due dates, mark work done, and reopen it. Tasks are saved in this browser across reloads; conversation stays in memory for the current visit.

With GPT configured, Veridian uses your task list and current page to help plan and update work. Proposed next steps have an **Add to my tasks** button. Without GPT, direct commands still work: “Add call the school tomorrow”, “Make call the school high priority”, “Complete call the school”, or **Plan my day**. The VCTA does not send messages or change external calendars.

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
mic (push-to-talk or Arduino sonar, after Arm) → browser SpeechRecognition → transcript
  → POST /api/desk/hear      text only (voice / typed / scripted)
  → web/lib/desk/planner.ts  GPT Responses API → validated chat / executive plan / filing actions
  → web/lib/desk/agent.ts    executes a validated filing plan, or offline rules on provider failure
  → web/lib/desk/tools.ts    plain functions file the work, keyed so nothing doubles
  → web/data/desk-state.json one JSON file; no database, no login
  → browser speechSynthesis speaks one short confirmation for voice/demo input
  → /desk                    the board in front changes with the speaker
```

- **Say it once.** Every utterance is keyed by normalized text + speaker + day, and every fact it writes has its own key, so a reworded repeat says “Already filed”.
- **Truth ledger.** Grant and quarterly text may only carry figures that exist in the ledger (`web/lib/desk/ledger.ts`).
- **Data classes.** `PUBLIC_COMMUNITY`, `OPERATIONAL`, `DONOR`, `CLINICAL`. Only `PUBLIC_COMMUNITY` crosses between organizations. Its text is built from structured fields and re-checked for names, counseling content, amounts and addresses (`web/lib/desk/privacy.ts`).
- **Consent.** No always-on microphone. After Arm, browser recognition starts while push-to-talk is held or while a hand is held near the sonar. Release the button, move the hand away, or click **Stop and file** to finish and wait for the final transcript; Disarm cancels and discards unfiled speech. Browser recognition may end sooner and has a 60-second limit. Only text goes to the desk; no audio is uploaded or stored by the app. The browser may use its own speech service. Matches stay pending until both orgs accept, and shift offers until the person accepts.
- **Model context.** GPT receives the current request, bounded conversation history, and relevant desk work. Stored clinical notes, family records, donor emails, and gift amounts are excluded. The Responses API uses `store: false`. History stays in browser memory and is cleared by reload or demo reset.
- **Learning, honestly.** One remembered preference: Marisol's call list grouped by school.
- **Haitian Creole.** Live Creole audio has not been verified for this demo; staff can enter notes as text.

The implementation follows the official [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) documentation and the browser [SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) and [SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis) APIs.

## Hardware

An optional Arduino Uno or classic Nano connects over USB: an Adafruit SSD1306 I²C OLED (SCK/SCL **A5**, SDA **A4**), an HC-SR04 sonar (Trig **7**, Echo **6**), and a status LED (**5**). On `/desk` in desktop Chrome or Edge, choose **Connect Arduino**, then **Arm** and hold your hand 2–20 cm from the sonar while speaking. Move it at least 30 cm away, or out of range, to stop and file. Disarm cancels a pending capture. Upload the updated [firmware/desk_node/desk_node.ino](firmware/desk_node/desk_node.ino) for hand-away detection; see [firmware/README.md](firmware/README.md) for wiring, libraries and setup. Manual push-to-talk works without a board.

## Docs

- [docs/hackathon/DEMO-SCRIPT.md](docs/hackathon/DEMO-SCRIPT.md) — the 4-minute demo, Q&A moves, failure modes.
- [docs/hackathon/MASTER-PROMPT-VERIDIAN-DESK.md](docs/hackathon/MASTER-PROMPT-VERIDIAN-DESK.md) — the build spec.
- [docs/node-clip.md](docs/node-clip.md) — the consent state machine the node follows.

## License

MIT — see [LICENSE](LICENSE).
