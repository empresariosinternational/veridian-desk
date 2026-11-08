# Veridian Desk — demo script (4 minutes)

DevDay Exchange · Codex Hackathon for Miami's Non-Profits · The LAB Miami · Nov 7–8, 2026.
Submit on DeepStation by **Sunday, Nov 8, 4:45 PM ET**. Be in the room at **4:30 PM**.

## DeepStation blurb

Veridian Desk is a push-to-talk assistant for nonprofits, communities, and the people in them. Staff and neighbors say each fact once. The browser recognizes their speech. Deepgram Aura-2 speaks the confirmation; optional GPT plans the filing actions. The desk files the note, merges a duplicate donor before Give Miami Day, turns a workshop request into an approval checklist, keeps counseling detail out of the funder report, and drafts a grant update from a truth ledger. The same network staffs a shift, recruits a person who already offered to help, and lets a second community accept a public same-day need. A sensor node shows when the desk is listening. GPT powers chat and executive task planning; voice uses the browser.

## Run it

```bash
cd web
npm install
npm run dev                    # open localhost:3000/desk for browser hardware APIs
# open http://localhost:3000/desk
```

Before you go on:

1. The header pill should say **Deepgram · Thalia & Selena**. Allow microphone access in a browser with speech recognition. `DEEPGRAM_API_KEY` must be set on the server. GPT is optional: without its key, desk-rule filing still works.
2. Do one live test so the browser asks for the microphone now, not on stage: **Arm**, hold **Hold to talk**, say “This is Ana. Testing the desk.”, release, and listen for the spoken confirmation.
3. Press **Reset demo** twice (the second click confirms). The desk is back to the seed.
4. Laptop volume up. Deepgram speaks the confirmation in Thalia (English) or Selena (Spanish).

Every line below has a button in the left panel. The buttons send the exact text through the same pipeline as the mic (`POST /api/desk/hear`), so a loud room cannot kill the demo. Speak a line live when the room is quiet. Use the button when it is not.

Each **Arm** opens one capture: the line files, the light goes green, then back to idle. Arm again before each line you speak live. The buttons are typed text, so they do not need Arm.

## Chat and executive planning

Select **Owen**, send “What needs attention today?” in Chat, then ask a follow-up. After filing the driver need, press **Plan my day**: point to the priority, owner, date, and approval requirement. No records change until staff use **File a note** or the existing approval buttons. Conversations are separate for each profile.

## The script

| Time | Do | Say / point at |
|---|---|---|
| 0:00 | **Arm.** Status ARMED. Hold to talk, or keep a hand within 10 cm of the connected Arduino sonar; status changes to LISTENING. Move the hand beyond 10 cm to stop and file immediately. | “Nothing listens until a person arms it. Hold to talk or keep your hand within 10 centimeters of the sensor while speaking, then move it farther away to stop and file immediately.” |
| 0:15 | **2 · Marisol:** “This is Marisol. Jordan missed mentoring on Tuesday. Call his mom this week.” | Calls board: Jordan's mom, due Friday. Quarterly report follow-ups go 0 → 1. |
| 0:35 | **3 · Denise:** “This is Denise. Maria Gonzalez is on the donor list twice and has not given since March.” | Two records become one; the shared gift counts once. “Call before Give Miami Day — Thu, Nov 19.” |
| 0:55 | **4 · Yesenia:** “This is Yesenia. Edison Elementary wants a safety workshop on Thursday in Spanish.” | Card: Edison, Thu Nov 12, Español, `slides-pending`, checklist with an owner per step. |
| 1:15 | **5 · Reginald:** “This is Reginald. Session note: Jordan talked about panic before school. Funder does not need that detail.” | Stored once under CLINICAL. Flip **Funder view**: only “School-based counseling session completed” + ledger id. |
| 1:40 | **6 · Owen:** “This is Owen. Ana volunteered 3 hours yesterday. We need a driver in West Little River today.” | Hours count once. Driver shift opens, urgent and routed to Owen. The status light blinks. Luis gets a pending offer with one sentence on why. |
| 2:05 | **7 · Claudette:** “This is Claudette. Draft the county quarterly update. Only what is true.” | Every figure cites a ledger id. Only $120,000 and $80,000. Spend line shows the funder's rule. |
| 2:30 | **8 · Beatriz:** “This is Beatriz. Colony B needs food today.” | Colony B is a public card the same day. The network proposes Tidepath's run ↔ Mangrove's food run, pending both orgs. |
| 2:50 | **9 · Luis's chip** (B2C). Optional: the Spanish line “Soy Luis. Hoy puedo manejar en West Little River.” Then **Accept**. | His desk shows the shift; Tidepath's staffing card shows filled; the blink stops. “Decline works too, and costs him nothing.” |
| 3:15 | **10 · Network:** **Accept for Tidepath**, then **Accept for Mangrove Mews**. | Both org boards update. No child name on that card — only PUBLIC_COMMUNITY crosses. |
| 3:35 | **Repeat Marisol.** | “Already filed.” Nothing doubled. |
| 3:45 | **11 · Close** on the line already on screen. | “Said once. Filed once. The right person and the other community answered the same day.” |

## If a judge asks

- **“What if the model makes up a number?”** Grants board → *Try to add a number* → “We spent $90,000 on food for 1,200 kids.” → both figures come back *removed — not in the ledger*, and the funder-rule warning fires on “food”.
- **“Is the funder view just hidden text?”** No. `GET /api/desk/state?view=funder` is a server-side projection: CLINICAL text never leaves the server in that view.
- **“What crosses between organizations?”** Only `PUBLIC_COMMUNITY`, built from structured fields (org, kind, area, day). `POST /api/desk/match/accept` re-checks and rejects names, counseling content, amounts and addresses.
- **“Does it learn?”** One honest thing: Marisol clicks *Group call list by school* once, and the desk remembers it on her profile (`rememberPreference`). Nothing else is learned.
- **“Haitian Creole?”** Live Creole audio has not been verified for this demo, so Creole notes are entered by staff. The Jean-Baptiste household shows how.
- **“Where's the AI?”** GPT handles multi-turn chat, executive task planning, and structured filing plans. The browser handles speech recognition and playback without an application key. Filing tools enforce deduplication, privacy, the ledger and consent; offline rules preserve the demo if OpenAI is unavailable.

## If something breaks

| Problem | What happens / do this |
|---|---|
| No key or OpenAI times out | Voice and demo lines still file by desk rules, with browser-spoken confirmations. GPT chat/planning require the optional OpenAI key. |
| Mic blocked | Use the buttons. |
| Arduino unplugged | Pending sonar capture is discarded. Manual push-to-talk and the on-screen node remain available. |
| Demo state is messy | **Reset demo** (two clicks). State lives in `web/data/desk-state.json`. |

Prove it before you go on: `cd web && npm run desk:smoke` runs this whole script offline and checks the definition of done.

## What is real and what is demo

- Real: push-to-talk capture, GPT Responses API chat/planning, browser speech recognition, Deepgram Aura-2 playback, say-it-once keys, the truth-ledger guard, server-side funder redaction, the public-only network check, dual-consent accept, B2C accept/decline, the JSON store, and the node protocol.
- Demo: all people, organizations, schools, donors and amounts are fictional. Tidepath Family Alliance and Mangrove Mews are made up.

## Submission checklist

- [ ] Public GitHub repo with an MIT or Apache-2.0 license (see `docs/hackathon/LICENSE`).
- [ ] Keep `DEEPGRAM_API_KEY` and, if using GPT, the OpenAI key in the server environment. `web/.env.local` is gitignored.
- [ ] DeepStation: project name, this blurb, GitHub link → **Submit Project** by 4:45 PM ET.
- [ ] Optional: phone video of one full run (YouTube link or MP4 ≤ 500 MB).
