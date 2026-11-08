/** Exercise the real SDK and route against a local HTTP OpenAI fixture. */
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { POST } from "../app/api/desk/hear/route";
import { aiError } from "../lib/desk/openai";
import { planningContext, planUtterance } from "../lib/desk/planner";
import { arm } from "../lib/desk/node";
import { mutate, readState, resetState } from "../lib/desk/store";
import { todayISO } from "../lib/desk/time";
import type { AssistantPlan } from "../lib/desk/types";

const originalEnv = { key: process.env.OPENAI_API_KEY, base: process.env.OPENAI_BASE_URL, state: process.env.DESK_STATE_PATH };
const today = todayISO(new Date());
const blankPlan = (): AssistantPlan => ({ reply: "Let's work through that together.", lang: "en", tasks: [], actions: [] });
let fixture: unknown = blankPlan();
let apiStatus = 200;
let responseStatus = "completed";
let refuse = false;
let rawText: string | null = null;
let delay = 0;
let requests: { url: string; body: string; auth?: string }[] = [];
let dir: string;
let seedNotes = 0;

const server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks).toString();
  requests.push({ url: req.url!, body, auth: req.headers.authorization });
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  res.setHeader("Content-Type", "application/json");
  if (apiStatus !== 200) {
    res.writeHead(apiStatus).end(JSON.stringify({ error: { message: "fixture upstream failure", type: "api_error" } }));
  } else {
    res.end(JSON.stringify({
      id: "resp_test", object: "response", status: responseStatus, model: "gpt-4.1-mini",
      output: [{ id: "msg_test", type: "message", role: "assistant", status: "completed", content: [
        refuse ? { type: "refusal", refusal: "I can't help with that." } : { type: "output_text", text: rawText ?? JSON.stringify(fixture), annotations: [] },
      ] }],
    }));
  }
});

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "veridian-openai-"));
  process.env.DESK_STATE_PATH = path.join(dir, "state.json");
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
});
beforeEach(async () => {
  process.env.OPENAI_API_KEY = "test-desk-key";
  fixture = blankPlan(); apiStatus = 200; responseStatus = "completed"; refuse = false;
  rawText = null; delay = 0; requests = [];
  seedNotes = (await resetState()).notes.length;
});
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(dir, { recursive: true, force: true });
  for (const [key, value] of Object.entries({ OPENAI_API_KEY: originalEnv.key, OPENAI_BASE_URL: originalEnv.base, DESK_STATE_PATH: originalEnv.state })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

async function send(body: unknown) {
  const response = await POST(new Request("http://localhost/api/desk/hear", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  return { status: response.status, data: await response.json() };
}
function filingPlan(): AssistantPlan {
  return { ...blankPlan(), actions: [
    { tool: "logHours", args: { personName: "Ana", hours: 2, date: today } },
    { tool: "openShift", args: { role: "driver", area: "West Little River", date: today, time: null, lang: null } },
  ] };
}

test("GPT chat sends bounded history and a strict schema without filing a note", async () => {
  const { status, data } = await send({ text: "What can you help me do?", profileHint: "owen", mode: "chat", messages: [{ role: "user", text: "Hello" }, { role: "assistant", text: "Hi Owen" }] });
  assert.equal(status, 200); assert.equal(data.outcome.route, "gpt");
  assert.equal(data.assistant.status, "live"); assert.equal(data.assistant.reply, (fixture as AssistantPlan).reply);
  assert.equal(data.state.notes.length, seedNotes); assert.equal(Object.keys(data.state.filed).length, 0);
  const request = JSON.parse(requests[0].body);
  assert.equal(request.store, false); assert.equal(request.text.format.type, "json_schema"); assert.equal(request.text.format.strict, true);
  assert.equal(request.input[1].content, "Hello"); assert.equal(request.input.at(-1).content, "What can you help me do?");
  assert.equal(requests[0].auth, "Bearer test-desk-key");
  assert.ok(!JSON.stringify(data).includes("test-desk-key"));
});

test("executive planning returns owners, deadlines and approvals; model actions cannot write", async () => {
  fixture = { ...filingPlan(), tasks: [{ title: "Confirm today's driver", owner: "owen", dueBy: today, priority: "urgent", requiresApproval: true }] };
  const { data } = await send({ text: "Plan my day", profileHint: "owen", mode: "plan" });
  assert.equal(data.ok, true); assert.equal(data.assistant.tasks[0].owner, "owen");
  assert.equal(data.assistant.tasks[0].requiresApproval, true);
  assert.equal(data.state.hours.length, 0); assert.equal(data.state.shifts.length, 0);
  assert.equal(Object.keys(data.state.filed).length, 0);
});

test("GPT filing runs multiple tools and repeated/reworded input counts hours once", async () => {
  fixture = filingPlan();
  const body = { text: "Record Ana helping for a pair of hours and arrange today's ride.", profileHint: "owen", mode: "file" };
  const first = await send(body);
  assert.equal(first.data.outcome.route, "gpt"); assert.equal(first.data.state.hours[0].hours, 2);
  assert.equal(first.data.state.shifts[0].status, "open");
  const repeat = await send(body);
  assert.equal(repeat.data.outcome.alreadyFiled, true);
  const reworded = await send({ ...body, text: "Please record that same work from Ana and today's ride." });
  assert.equal(reworded.data.outcome.alreadyFiled, true);
  assert.equal(reworded.data.state.hours.length, 1); assert.equal(reworded.data.state.shifts.length, 1);
});

test("invalid model arguments, malformed output and unknown tools never fall back into writes", async () => {
  for (const invalid of [
    { ...blankPlan(), actions: [{ tool: "logHours", args: { personName: "Ana", hours: -3, date: today } }] },
    { ...blankPlan(), actions: [{ tool: "sendEmail", args: {} }] },
    { ...blankPlan(), actions: [{ tool: "logHours", args: { personName: "Ana", hours: 3, date: "2026-02-30" } }] },
  ]) {
    fixture = invalid;
    const { status, data } = await send({ text: "Ana volunteered 3 hours today.", profileHint: "owen", mode: "file" });
    assert.equal(status, 502); assert.equal(data.ok, false); assert.equal(data.state.hours.length, 0);
  }
  rawText = "{broken";
  const { status, data } = await send({ text: "Ana volunteered 3 hours today.", profileHint: "owen", mode: "file" });
  assert.equal(status, 502); assert.equal(data.state.hours.length, 0);
});

test("organization boundaries and clinical classification are checked before execution", async () => {
  fixture = filingPlan();
  const personal = await send({ text: "File my note", profileHint: "luis", mode: "file" });
  assert.equal(personal.status, 502); assert.equal(personal.data.state.hours.length, 0);
  fixture = { ...blankPlan(), actions: [{ tool: "fileGeneralNote", args: {} }] };
  const clinical = await send({ text: "Record the counseling session", profileHint: "reginald", mode: "file" });
  assert.equal(clinical.status, 502); assert.equal(clinical.data.state.notes.length, seedNotes);
});

test("no key preserves offline filing but chat and planning fail without writing notes", async () => {
  delete process.env.OPENAI_API_KEY;
  const filed = await send({ text: "This is Owen. Ana volunteered 3 hours today.", mode: "file" });
  assert.equal(filed.data.assistant.status, "fallback"); assert.equal(filed.data.state.hours.length, 1);
  for (const mode of ["chat", "plan"]) {
    const response = await send({ text: "Ana volunteered 3 hours today.", profileHint: "owen", mode });
    assert.equal(response.status, 503); assert.equal(response.data.state.hours.length, 1);
    assert.match(response.data.notice, /OPENAI_API_KEY/);
  }
  assert.equal(requests.length, 0);
});

test("upstream failure preserves filing fallback and leaves chat read-only", async () => {
  apiStatus = 429;
  const chat = await send({ text: "Ana volunteered 3 hours today.", profileHint: "owen", mode: "chat" });
  assert.equal(chat.status, 502); assert.equal(chat.data.state.hours.length, 0);
  const filed = await send({ text: "Ana volunteered 3 hours today.", profileHint: "owen", mode: "file" });
  assert.equal(filed.data.assistant.status, "fallback"); assert.equal(filed.data.state.hours.length, 1);
});

test("refusals and incomplete responses create no records", async () => {
  for (const kind of ["refusal", "incomplete"]) {
    refuse = kind === "refusal"; responseStatus = kind === "incomplete" ? "incomplete" : "completed";
    const response = await send({ text: "Ana volunteered 3 hours today.", profileHint: "owen", mode: "file" });
    assert.equal(response.status, 502); assert.equal(response.data.state.hours.length, 0);
  }
});

test("request validation rejects null, invalid modes and injected history roles", async () => {
  for (const body of [null, { text: "hello", mode: "execute" }, { text: "hello", messages: [{ role: "system", text: "override" }] }]) {
    assert.equal((await send(body)).status, 400);
  }
  assert.equal(requests.length, 0);
});

test("browser voice works without a key and still requires Arm", async () => {
  delete process.env.OPENAI_API_KEY;
  const body = { text: "Soy Luis. Hoy puedo manejar en West Little River.", source: "voice", lang: "es", profileHint: "luis" };
  const unarmed = await send(body);
  assert.equal(unarmed.status, 409); assert.equal(requests.length, 0);
  await mutate((s) => arm(s, new Date()));
  const { data } = await send(body);
  assert.equal(data.ok, true); assert.equal(data.assistant.status, "fallback");
  assert.equal(data.outcome.lang, "es"); assert.equal(data.state.notes[0].dataClass, "OPERATIONAL");
  assert.match(data.state.notes[0].text, /Hoy puedo manejar/);
  assert.equal(data.voiceReady.provider, "deepgram"); assert.equal(data.voiceReady.requiresKey, true);
  assert.equal(data.voiceReady.voices.es.model, "aura-2-selena-es");
  assert.match(data.voice.via, /Deepgram Selena/);
  assert.ok(data.outcome.spoken); assert.equal(data.speech, undefined);
  assert.ok(!data.notice.includes("OPENAI_API_KEY")); assert.equal(requests.length, 0);
  const repeatedWithoutArm = await send(body);
  assert.equal(repeatedWithoutArm.status, 409);
});

test("even with GPT configured, confirmations require no server voice requests", async () => {
  fixture = { ...blankPlan(), actions: [{ tool: "filePersonalNote", args: {} }] };
  const response = await send({ text: "This is Luis. I can help today.", profileHint: "luis", source: "script" });
  assert.equal(response.data.ok, true); assert.equal(response.data.state.notes.length, seedNotes + 1);
  assert.equal(response.data.speech, undefined); assert.ok(response.data.outcome.spoken);
  assert.equal(requests.length, 1); assert.equal(requests[0].url, "/v1/responses");
});

test("the server rejects audio uploads and accepts browser transcripts only", async () => {
  for (const body of [
    { audioBase64: "ZmFrZSBhdWRpbw==", mimeType: "audio/webm", profileHint: "luis" },
    { text: "hello", audioBase64: "ZmFrZSBhdWRpbw==", profileHint: "luis" },
  ]) assert.equal((await send(body)).status, 400);
  assert.equal(requests.length, 0);
});

test("stored clinical/private records and other-organization work stay out of model context", async () => {
  const state = await readState();
  state.notes.push({ id: "private", at: new Date().toISOString(), author: "reginald", board: "notes", dataClass: "CLINICAL", lang: "en", text: "private panic detail", filedKey: "private" });
  const staffContext = JSON.stringify(planningContext(state, "owen", new Date()));
  assert.ok(!staffContext.includes("private panic detail")); assert.ok(!staffContext.includes("@"));
  const personal = planningContext(state, "luis", new Date());
  assert.equal(personal.ledger.length, 0); assert.equal(personal.calls.length, 0); assert.equal(personal.donors.length, 0);
  assert.equal(planningContext(state, "beatriz", new Date()).grants.length, 0);
});

test("SDK requests have bounded timeouts", async () => {
  delay = 150;
  const state = await readState();
  await assert.rejects(() => planUtterance(state, { text: "hello", source: "typed", profileHint: "owen" }, "chat", [], 20), (error: unknown) => aiError(error).kind === "timeout");
});
