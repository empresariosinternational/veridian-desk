/** Aura-2 paces from the text. Markdown and symbols must reach it as plain sentences. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPEAK_SPEED, speakMessages, speakStreamUrl, speechText } from "../lib/desk/deepgram-voice";

test("plain confirmations pass through unchanged", () => {
  for (const line of ["Filed once. Jordan's mom is on this week's call list.", "Ya está anotado.", "Call Maria before Give Miami Day."]) {
    assert.equal(speechText(line), line);
  }
});

test("markdown, bullets and line breaks become sentences", () => {
  assert.equal(
    speechText("**Today** you have two calls:\n- Call *Ana* about Give Miami Day\n- Confirm the driver\n\nThat's it…"),
    "Today you have two calls: Call Ana about Give Miami Day. Confirm the driver. That's it.",
  );
  assert.equal(speechText("## Plan\n1. Arm the desk\n2) Speak once"), "Plan. Arm the desk. Speak once");
});

test("symbols that read as pauses are replaced", () => {
  assert.equal(speechText("Marisol · program"), "Marisol, program");
  assert.equal(speechText("desk → events"), "desk to events");
  assert.equal(speechText("Give Miami Day is Thu, Nov 19 — 11 days away."), "Give Miami Day is Thu, Nov 19, 11 days away.");
  assert.equal(speechText("Done ✅ See [the board](https://example.org/board)."), "Done See the board.");
});

test("identifiers and numbers are left alone", () => {
  assert.equal(speechText("PUBLIC_COMMUNITY only. $120,000 and 3.5 hours."), "PUBLIC_COMMUNITY only. $120,000 and 3.5 hours.");
  assert.equal(speechText("2*3 is 6"), "2*3 is 6");
});

test("the Speak message carries the cleaned line", () => {
  const [speak] = speakMessages("- Filed once\n- Nothing doubled").map((m) => JSON.parse(m) as { text: string });
  assert.equal(speak.text, "Filed once. Nothing doubled");
});

test("English speaks at Thalia's natural pace; Spanish keeps 1.15", () => {
  const english = new URL(speakStreamUrl("en"));
  assert.equal(english.searchParams.get("model"), "aura-2-thalia-en");
  assert.equal(english.searchParams.has("speed"), false);
  assert.equal(SPEAK_SPEED.en, 1);
  const spanish = new URL(speakStreamUrl("es"));
  assert.equal(spanish.searchParams.get("model"), "aura-2-selena-es");
  assert.equal(spanish.searchParams.get("speed"), "1.15");
});
