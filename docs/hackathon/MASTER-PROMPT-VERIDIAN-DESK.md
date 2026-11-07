# Master prompt — Claude Opus 5.5

Paste everything below the line into a fresh Claude Opus 5.5 session with this repository open. Execute it. Do not redesign it.

Deadline: Sunday, November 8, 2026, 4:45 PM ET. The team must be in person at The LAB Miami at 4:30 PM to submit. Event: DevDay Exchange / Codex Hackathon for Miami's Non-Profits, on DeepStation (`https://deepstation.ai/hackathons/vtl7ctbeihnikitvjwl3941h`).

---

You are Claude Opus 5.5, staff engineer for a live hackathon. Ship **Veridian Desk** inside this repo: one consented hardware-linked assistant that lets a nonprofit, a community, or a person say each thing once. The same desk automates note taking, networking, staffing, and recruiting for organizations (B2B) and for people (B2C). Veridian is the assistant/OS. Agentscene is the existing network around it. Do not rebuild Agentscene.

Today is Saturday, November 7, 2026, during the hackathon. Optimize for a 4-minute live demo and a Monday-usable staff screen. Cut anything that does not appear in that demo.

## Read first (only these)

- `.cursorrules`
- `docs/node-clip.md` (consent state machine — follow it)
- `docs/PRODUCT-SPEC-CTO-HANDOFF.md` sections 1–3 only (brand, tokens, what not to break)
- `web/app/globals.css` token names
- `web/components/VeridianMark.tsx`, `web/components/VeridianDock.tsx`
- `web/lib/social-scene/agent-protocol.ts` (dual-consent match shape — mirror it, do not fork a second protocol)

Do not tour the rest of the repo. Do not refactor adjacent code.

## Win condition

Judges fund nonprofits. They have seen chatbots. Win by showing all of this in one pass:

1. A staffer speaks once. The same fact never gets typed again.
2. The urgent thing reaches the right role the same day.
3. A quarterly report and a grant draft use only a truth ledger.
4. A counselor's note exists once, and the funder view is a redaction.
5. A second community's agent answers a public need with dual consent.
6. A physical node shows listening / working / urgent. The laptop still works if the node is unplugged.
7. **Browser voice needs no key.** Browser speech recognition handles the microphone and speech synthesis reads confirmations. Optional OpenAI GPT handles chat, executive task planning, and validated filing plans. Desk tools file the work; an Agents SDK is not required.

## Who it serves

One product, two sides. Profile switch changes the board in front, not a different app.

- **B2B — organizations.** Nonprofits, schools, community groups, and local businesses. Tidepath's desk, Edison Elementary's workshop request, Mangrove Mews' colony. They network with each other, staff open shifts, and recruit people into roles.
- **B2C — people.** Volunteers, mentors, families, donors, and neighbors. Ana and Luis each have a personal desk: their notes, the shifts they are offered, and the communities that want them. They accept or decline. Nothing is assigned in silence.

Four automations, both sides:

| Automation | B2B | B2C |
|---|---|---|
| Note taking | Meeting or program note files once onto the org board that needs it. | A personal note files once onto that person's desk. |
| Networking | Org agents exchange a public need and both accept. | A person is introduced only to a role or community that fits what they already offered. |
| Staffing | An open shift (driver, mentor, workshop helper) is posted the same day with time, place, and language. | The person sees "you match this shift" and accepts. |
| Recruiting | A standing role (mentor, driver, event helper) stays open until the right person accepts. | The person sees why they were asked, in one sentence, and can decline. |

## Secrets

- Never hardcode API keys. Never print them. Never commit them.
- `OPENAI_API_KEY` is optional for GPT chat/planning and comes from the local shell or `web/.env.local`, and the same server-side variable on Vercel. Voice and desk-rule filing need no key. Never expose it with a `NEXT_PUBLIC_` prefix.
- `.gitignore` already ignores `web/.env`, `web/.env.*` (except `web/.env.example`), and `web/data/desk-state.json`.
- Add `web/.env.example` with empty values and one-line comments.
- OpenAI is called only from a server route. The browser never sees the key.
- If a key is missing, the desk still runs the scripted utterances through the same tools, and the UI labels the offline filing fallback; chat and planning return an error without writing records. Do not crash.

## Non-negotiables

- Do not add a database, login, or user table. Desk state is a JSON file at `web/data/desk-state.json` plus the committed seed. Core scene routes stay URL-as-account.
- Do not call Luma, and do not route new traffic through `luma-rate-limit.ts`. This demo does not need Luma.
- Do not scrape.
- No always-on microphone. No hidden recording. No "listen to the room" mode.
- Capture is push-to-talk or while a hand stays near the Arduino sonar, after an explicit arm, with a visible listening state. Releasing the button or moving the hand away stops capture; browser recognition may end sooner and has a 60-second limit. Follow the node-clip state machine: IDLE → ARMED (consent) → LISTENING → WORKING → FILED → IDLE. Raw audio is not stored. Keep the transcript only as the filed note the staffer just spoke.
- Data classes: `PUBLIC_COMMUNITY`, `OPERATIONAL`, `DONOR`, `CLINICAL`. The agent-to-agent network may carry only `PUBLIC_COMMUNITY`. It must not contain child names, counseling content, donor amounts, or addresses.
- Demo data is fictional. Tidepath Family Alliance and Mangrove Mews are made-up.
- Human approval before any outward send. Matches stay `pending` until the demo clicks Accept.
- Do not invent metrics. Grant and quarterly text may only use ids in the truth ledger. If a model adds a number that is not in the ledger, strip it and show "removed — not in the ledger".
- Match existing visual tokens (`--page-bg`, `--surface-*`, `--accent*`, `--veridian*`, `--r-*`). Do not invent a new palette.
- Fail soft. One broken sensor, model timeout, or missing key must not blank the page.
- No flame sensor, MQ2 gas sensor, pump, motor, or heart-rate sensor in the demo path. They are not part of this product.

## Product

**Veridian Desk** is the front desk of a nine-person nonprofit and the pocket desk of a person in that community. One device. Six staff jobs. A second org on the same network. A person on the same network can be recruited into a shift.

Tidepath (fictional): Miami-Dade. About 900 kids and 150 families a year in Little Havana and West Little River. English, Spanish, Haitian Creole. Programs: mentoring, family counseling, school workshops, community events. Budget about $900,000, mostly grants, plus donors and a gala. Tools today: Sheets, a donor CRM, Mailchimp, QuickBooks, WhatsApp, Canva. Give Miami Day is November 19, 2026 — twelve days after this hackathon. Denise's board must say that.

The device is an extension of the desk, not a surveillance box. Arm it, speak, it files. Profile switch changes whose board is in front, not a different app.

Org profiles (B2B): Marisol (program), Denise (donors), Yesenia (workshops), Reginald (counseling), Owen (volunteers), Claudette (grants), Beatriz (Mangrove Mews).

People profiles (B2C): Ana Morales (hours and notes), Luis Ortega (offers driving, Spanish, West Little River, weekends). Luis is seeded. Ana's hours appear only after Owen speaks.

## What the desk does

| Person | Job | After one utterance |
|---|---|---|
| Marisol | Say it once | Case note filed once. Call list for this week. Quarterly report section updates from the ledger. |
| Denise | Donors | Duplicate Maria / María González merges. Lapse (no gift since March) flagged. "Call before Give Miami Day". |
| Yesenia | Workshops | Request becomes a card: school, language, date, status `slides-pending`, checklist. Nobody to chase. |
| Reginald | Notes | Clinical note stored once under `CLINICAL`. Funder view shows only "school-based counseling session completed" plus the ledger id. |
| Owen | Staffing and recruiting | Hours append once (note). A driver shift opens the same day: West Little River, today. Veridian recruits Luis, the B2C person who already offered driving, and waits for Accept. |
| Claudette | Grants | Draft in Tidepath's plain voice. Every figure cites a ledger id. Spend line shows the funder's rule. |
| Beatriz | Networking | Colony status is a public card the same day. Tidepath's public need can match Mangrove only as `PUBLIC_COMMUNITY`. Both orgs accept. This is B2B networking. Luis's shift offer is B2C recruiting. They are different cards. |

Say-it-once is an idempotency key: normalized utterance text + speaker + day. A repeat shows "Already filed" and does not double hours, notes, or gifts.

Self-learning, demo-honest: tool `rememberPreference`. Seed Marisol with no preference. After the demo clicks "Group call list by school", persist `{ callListGrouping: "school" }` on her profile and show "Veridian remembered". Next render uses it. No other learning system.

Spanish: one live or scripted line must file in Spanish and show the language on the card. Haitian Creole: seed one family marked `ht` with a staff-entered summary. Do not claim live Creole transcription unless you have verified the browser speech service supports `ht`. If it does not, say so in the UI as "Creole notes are entered by staff".

## Demo script (rehearse this, do not improvise)

4 minutes. Buttons labeled with these lines must run the same pipeline as the mic, so a loud room cannot kill the demo.

1. Arm. Status LISTENING. Traffic-light analog is red. OLED line: "Listening — Tidepath desk".
2. Marisol: "This is Marisol. Jordan missed mentoring on Tuesday. Call his mom this week."
3. Denise: "This is Denise. Maria Gonzalez is on the donor list twice and has not given since March."
4. Yesenia: "This is Yesenia. Edison Elementary wants a safety workshop on Thursday in Spanish."
5. Reginald: "This is Reginald. Session note: Jordan talked about panic before school. Funder does not need that detail."
6. Owen: "This is Owen. Ana volunteered 3 hours yesterday. We need a driver in West Little River today."
7. Claudette: "This is Claudette. Draft the county quarterly update. Only what is true."
8. Beatriz: "This is Beatriz. Colony B needs food today."
9. On Luis's B2C profile, Accept the driver shift. His desk shows the shift. Tidepath's staffing card shows filled. Decline must be possible and must not punish the person.
10. Click Accept on the org match: Tidepath public need ↔ Mangrove food run. Both org boards update. No child name on that card.
11. Close on the line already on screen: "Said once. Filed once. The right person and the other community answered the same day."

Repeat Marisol's line. The UI must show Already filed.

## Seed (committed, fictional, consistent)

Put this in `web/lib/desk/seed.ts`. The truth ledger is the only source of numbers.

- Kids / families are counts, not a directory of real people. One demo mentee: Jordan Alvarez, fictional, Little Havana, mentor missed Tuesday, call mom this week. One Creole family: the Jean-Baptiste household, language `ht`, summary entered by staff, no clinical text.
- Donors: María González and a duplicate "Maria Gonzalez", last gift March 3, 2026, $50, email `maria.gonzalez@example.com`. Plus four other fictional donors so the merge is visible. One lapsed, one recent.
- Workshop: none confirmed yet. Edison Elementary safety workshop is created by the utterance.
- Volunteers: Ana Morales, 3 hours arrive only from Owen's utterance. Driver shift does not exist until Owen speaks.
- People: Luis Ortega, B2C, offers driving, Spanish, West Little River, weekends. He is the recruit for that shift. He has no hours until he accepts.
- Grants: County youth safety grant, $120,000, rule "workshops and mentoring only, no food, no fundraising gala". Spent so far $80,000 on workshops and mentoring (ledger ids `grant-county-awarded`, `grant-county-spent`). Do not let the draft say $90,000 or any other figure.
- Quarterly facts: 42 mentoring sessions in Q3 (`q3-mentoring-sessions`), 6 workshops (`q3-workshops`), 0 missed-call follow-ups until Marisol's utterance adds 1.
- Colony B, Mangrove Mews: status unknown until Beatriz speaks. Need: food. Public.
- Voice samples for Claudette, two sentences, store as `voiceGuide`: short sentences, no jargon, Spanish and English both welcome, never claim an outcome the ledger does not contain.

## Architecture

```
Mic or scripted line
  → POST /api/desk/hear   (browser-generated transcript or typed/scripted text only)
  → desk router + tools in web/lib/desk/tools.ts
  → web/data/desk-state.json
  → browser speechSynthesis speaks one confirmation sentence
  → one screen at /desk
```

Hardware is a physical echo of the same state, not a second brain.

- Browser voice: `SpeechRecognition` (or `webkitSpeechRecognition`) transcribes push-to-talk; `speechSynthesis` reads the returned confirmation. Neither needs an application key. Browser speech may use a vendor service. Never upload raw audio to the app or OpenAI. Stop waits for final recognition; Disarm aborts and discards pending results.
- Planner: `web/lib/desk/planner.ts` uses the OpenAI Responses API and a strict schema for reply, tasks, and filing actions. `web/lib/desk/agent.ts` applies validated plans through existing tools and retains the offline rules router. Chat and plan modes discard all filing actions.
- Tools are plain TypeScript functions. They read and write the JSON store. They return the updated card. They do not call a model.
- Server route runtime nodejs. Maximum duration 30s; optional GPT has a 20s timeout. On timeout or a missing OpenAI key, filing uses the desk rules, while browser voice still works. Chat/planning errors never become filed records.
- `POST /api/desk/hear` accepts `{ text, source: voice | typed | script, lang? }`, optional `mode: chat | plan | file`, and bounded `messages` history. Audio uploads are rejected. Voice transcripts require an armed window. The response includes the transcript, changed cards, and confirmation text for browser playback.
- `GET /api/desk/state` returns boards, node state, preferences, match proposals.
- `POST /api/desk/node` accepts `{ event: "arm" | "disarm" | "presence" }`. Arm opens a capture window. Disarm returns IDLE and drops any unfiled speech. Presence only adds a front-desk banner. Arduino sonar triggers reach the browser over USB and start recognition only within an armed window.
- `POST /api/desk/match/accept` with the proposal id. Both orgs must be in the payload check: class is `PUBLIC_COMMUNITY` or the route rejects.

Client page `web/app/desk/page.tsx` is a client console. Boards: Calls, Donors, Workshops, Notes (staff vs funder toggle), Staffing, Recruiting, Grants, Colony, Network. Node panel: status, Arm, Disarm, scripted line buttons, push-to-talk, and the spoken confirmation. Org / person chips switch B2B and B2C. Luis's chip shows his note, his shift offer, and Accept / Decline. Link it from the header only if that is a one-line addition. Do not restyle the rest of the site.

## Hardware

Kit: SunFounder Universal Maker Sensor Kit, ASIN B0D3GWJK82. It includes sensors and an OLED. It does **not** include a Pico, ESP32, or Arduino, and it has **no microphone**. Do not try to do speech-to-text on the kit.

Voice in and voice out use the laptop microphone and browser speech APIs, with no application key. The Arduino Uno or classic Nano displays state and sends sonar gestures over USB serial at 115200 baud.

- Firmware: `firmware/desk_node/desk_node.ino` using Adafruit SSD1306 and GFX.
- Adafruit I²C OLED: SCK/SCL → A5, SDA → A4. Probe addresses 0x3C and 0x3D.
- HC-SR04 sonar: Trig → pin 7, Echo → pin 6. A fresh hand gesture at 2–20 cm starts browser recognition after Arm. Keep the hand near while speaking; move it at least 30 cm away or out of range to stop and file, then make a fresh gesture for another capture.
- Status LED: pin 5 through a resistor. Armed pulse, listening solid, working blink, filed solid, idle/offline off.
- On `/desk`, choose Connect Arduino in desktop Chrome or Edge on localhost or HTTPS. The browser sends display state every second and listens for newline-delimited sonar events.
- Sonar capture stops on the Arduino's `sonar-release` event after five consecutive clear readings (about 400 ms), or when browser recognition ends (60-second limit). Stop and file also finishes capture; Disarm or USB disconnection cancels a pending capture.

Document wiring, upload and protocol in `firmware/README.md`. The on-screen node and manual push-to-talk work without a microcontroller.

## Files to add

- `web/lib/desk/types.ts`
- `web/lib/desk/seed.ts`
- `web/lib/desk/store.ts`
- `web/lib/desk/privacy.ts`
- `web/lib/desk/tools.ts`
- `web/lib/desk/agent.ts`
- `web/lib/desk/fallback.ts` (scripted lines → tools, no model)
- `web/app/api/desk/hear/route.ts`
- `web/app/api/desk/state/route.ts`
- `web/app/api/desk/node/route.ts`
- `web/app/api/desk/match/accept/route.ts`
- `web/app/desk/page.tsx`
- `web/components/desk/DeskConsole.tsx`
- `web/.env.example`
- `firmware/README.md`
- `firmware/desk_node/desk_node.ino`
- `docs/hackathon/DEMO-SCRIPT.md` (the 4-minute script plus the DeepStation blurb below)
- `LICENSE` only if one does not exist — MIT. Do not relicense third-party code you did not add. If adding a root LICENSE would misrepresent the existing private app, instead put MIT in `docs/hackathon/LICENSE` and say in the README that the **submission repo** must be public and MIT or Apache-2.0. Do not flip this repo public yourself.

Do not edit the scene digest, CRM storage format, or social-scene store except a header link.

## Build order

1. Types, seed, store, privacy, tools, fallback. Scripted Marisol line files once and the repeat is ignored. Prove with a small node script or a route test you can run.
2. `/desk` UI reading `GET /api/desk/state`, scripted buttons calling fallback so the demo already works.
3. Browser voice on the same tools: recognize push-to-talk, submit the transcript, and speak the confirmation. Same cards and browser playback if the OpenAI key is missing.
4. Node LED/OLED echo, or skip if no board.
5. Shift accept on Luis's desk, org-match accept, funder toggle, Give Miami Day line.
6. `npm run build` in `web/`. Fix type errors you created.
7. Write DEMO-SCRIPT.md. Rehearse.

## Definition of done

- `/desk` loads with seed data and no console errors.
- Each scripted line produces the card in the table above.
- Repeat of Marisol's line does not duplicate.
- Funder toggle on Reginald's note hides the panic sentence.
- Claudette's draft contains `$120,000` and `$80,000` and no other dollar amount.
- Owen's line opens one driver shift and a pending recruit card for Luis. Accept on Luis's desk fills the shift. Decline leaves it open.
- The Mangrove network card has no child name. Accept updates both org boards. It is a separate card from Luis's shift.
- Arm / Disarm changes node state without audio.
- Missing keys do not crash the page.
- `npm run build` succeeds.
- README or DEMO-SCRIPT includes this submission blurb, unchanged in substance:

> Veridian Desk is a push-to-talk assistant for nonprofits, communities, and the people in them. Staff and neighbors say each fact once. The browser recognizes their speech and speaks the confirmation without a voice key; optional GPT plans filing actions. The desk files the note, merges a duplicate donor before Give Miami Day, turns a workshop request into an approval checklist, keeps counseling detail out of the funder report, and drafts a grant update from a truth ledger. The same network staffs a shift, recruits a person who already offered to help, and lets a second community accept a public same-day need. A sensor node shows when the desk is listening. GPT powers chat and executive task planning; voice uses the browser.

## Out of scope

Payments, ticketing, eBay-style checkout, wallets, Solana, login, a mobile app, WhatsApp integration, QuickBooks sync, Mailchimp sync, real donor data, maps of people, ambient meeting recording, farmers-market implementation, using all 25 sensors, new design system, rewriting the homepage.

## When you finish

Report: files added, how to run, whether GPT chat/planning are configured, browser recognition/playback are supported, and desk-rule filing is in use, hardware status. Do not claim a sensor works if it is not wired.
