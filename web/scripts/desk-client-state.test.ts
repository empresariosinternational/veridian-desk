/**
 * Client mode (Vercel): serverless routes share no memory, so the browser holds
 * the desk JSON and sends it with each request. Arm in one request must be seen
 * by the capture in the next one, and the consent gate must still hold.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DESK_STATE_MODE = "client";
delete process.env.OPENAI_API_KEY;

import { GET as getState, POST as postState } from "../app/api/desk/state/route";
import { POST as postNode } from "../app/api/desk/node/route";
import { POST as postHear } from "../app/api/desk/hear/route";
import { POST as postAction } from "../app/api/desk/action/route";
import { parseClientState } from "../lib/desk/store";

const json = (url: string, body: unknown) =>
  new Request(`http://desk.test${url}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("GET returns the seed and says the browser holds the desk", async () => {
  const j = await (await getState(new Request("http://desk.test/api/desk/state"))).json();
  assert.equal(j.mode, "client");
  assert.equal(j.node.status, "IDLE");
  assert.ok(parseClientState(j.state));
});

test("Arm in one request is seen by the voice capture in the next", async () => {
  const seed = (await (await getState(new Request("http://desk.test/api/desk/state"))).json()).state;
  const armed = await (await postNode(json("/api/desk/node", { event: "arm", state: seed }))).json();
  assert.equal(armed.state.node.status, "LISTENING");
  const res = await postHear(json("/api/desk/hear", {
    text: "Soy Luis. Hoy puedo manejar en West Little River.", source: "voice", profileHint: "luis", lang: "es", state: armed.state,
  }));
  const heard = await res.json();
  assert.equal(res.status, 200, heard.notice);
  assert.equal(heard.ok, true);
  assert.equal(heard.state.node.status, "FILED");
  assert.ok(heard.state.feed.length > seed.feed.length, "the line was filed into the browser's copy");
});

test("The consent gate still holds: a voice capture without Arm is refused", async () => {
  const seed = (await (await getState(new Request("http://desk.test/api/desk/state"))).json()).state;
  const res = await postHear(json("/api/desk/hear", { text: "Soy Luis. Hoy puedo manejar.", source: "voice", profileHint: "luis", state: seed }));
  assert.equal(res.status, 409);
});

test("A malformed browser copy falls back to the seed", async () => {
  const j = await (await postState(json("/api/desk/state", { state: { version: 1, node: "nope" } }))).json();
  assert.equal(j.mode, "client");
  assert.equal(j.node.status, "IDLE");
});

test("Reset returns the seed in client mode", async () => {
  const seed = (await (await getState(new Request("http://desk.test/api/desk/state"))).json()).state;
  const armed = (await (await postNode(json("/api/desk/node", { event: "arm", state: seed }))).json()).state;
  const reset = await (await postAction(json("/api/desk/action", { type: "reset", state: armed }))).json();
  assert.equal(reset.ok, true);
  assert.equal(reset.state.node.status, "IDLE");
});
