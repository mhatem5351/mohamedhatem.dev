import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildContactEmail, escapeHtml } from "../src/contact/email";
import { contactRef, validateContact } from "../src/contact/validate";
import worker from "../src/index";
import { handleChat, SESSION_MESSAGE_CAP } from "../src/chat/handler";
import { chatRequest, fakeLimiter, finalChunk, geminiSse, makeCtx, makeEnv, ORIGIN, readSse, textChunk } from "./helpers";

/** Turnstile siteverify mock on the global fetch (the Worker calls it directly). */
function stubSiteverify(result: Record<string, unknown> = { success: true, hostname: "mohamedhatem.dev", action: "chat" }) {
  const fn = vi.fn(async (url: string | URL | Request) => {
    if (String(url).includes("siteverify")) return new Response(JSON.stringify(result));
    throw new Error(`unexpected fetch ${String(url)}`);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const gemini = (text = "Hatem leads AI engineering at Globant.") => vi.fn(async () => geminiSse([textChunk(text), finalChunk()]));

async function chat(body: unknown, opts: { env?: ReturnType<typeof makeEnv>; headers?: Record<string, string>; fetcher?: ReturnType<typeof gemini> } = {}) {
  const env = opts.env ?? makeEnv();
  const ctx = makeCtx();
  const fetcher = opts.fetcher ?? gemini();
  const res = await handleChat(chatRequest(body, opts.headers), env, ctx, { fetcher: fetcher as unknown as typeof fetch });
  return { res, env, ctx, fetcher };
}

beforeEach(() => {
  stubSiteverify();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/chat", () => {
  const first = { messages: [{ role: "user", content: "What does he do?" }], lang: "en", turnstileToken: "tok" };

  it("streams meta → tokens → done, sets a session cookie and sends security headers", async () => {
    const { res, env, ctx } = await chat(first);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream; charset=utf-8");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(res.headers.get("Set-Cookie")).toMatch(/^mh_chat=v2\..+; Path=\/api\/chat; Max-Age=1800; HttpOnly; Secure; SameSite=Strict$/);
    const events = await readSse(res);
    await Promise.all(ctx.pending);
    expect(events.map((e) => e.event)).toEqual(["meta", "token", "token", "done"]); // the last words come with the end
    expect(events[0]!.data).toMatchObject({ lang: "en", sessionExp: expect.any(Number) });
    expect(events[0]!.data.trimmed).toBeUndefined();
    expect(events.filter((e) => e.event === "token").map((e) => e.data.t).join("")).toBe("Hatem leads AI engineering at Globant.");
    // Analytics: counts and latency only, never the text or the IP.
    expect(env.points).toHaveLength(1);
    const point = JSON.stringify(env.points[0]);
    expect(point).not.toContain("What does he do");
    expect(point).not.toContain("203.0.113.7");
  });

  it("answers in Arabic for Arabic input even on the English page", async () => {
    const { res, fetcher } = await chat({ ...first, messages: [{ role: "user", content: "ما هي خبرته في LangGraph؟" }] });
    const events = await readSse(res);
    expect(events[0]!.data.lang).toBe("ar");
    const body = JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body.systemInstruction.parts[0].text).toContain("Write this answer in Arabic");
  });

  it("a valid session cookie skips Turnstile", async () => {
    const { res } = await chat(first);
    const cookie = res.headers.get("Set-Cookie")!.split(";")[0]!;
    await readSse(res);
    const siteverify = stubSiteverify();
    const second = await chat({ messages: [{ role: "user", content: "And before?" }] }, { headers: { Cookie: cookie } });
    expect(second.res.status).toBe(200);
    expect(second.res.headers.get("Set-Cookie")).toBeNull(); // fresh session: no refresh yet
    expect(siteverify).not.toHaveBeenCalled();
    await readSse(second.res);
  });

  it("401 turnstile_required without a session or token; 403 when Turnstile fails", async () => {
    const none = await chat({ messages: [{ role: "user", content: "hi" }] });
    expect(none.res.status).toBe(401);
    expect(await none.res.json()).toMatchObject({ ok: false, error: "turnstile_required" });
    expect(none.fetcher).not.toHaveBeenCalled();

    stubSiteverify({ success: false, "error-codes": ["invalid-input-response"] });
    const bad = await chat(first);
    expect(bad.res.status).toBe(403);
    expect(await bad.res.json()).toMatchObject({ error: "turnstile_failed" });
  });

  it("a forged or expired cookie is ignored (Turnstile required again)", async () => {
    const r = await chat({ messages: [{ role: "user", content: "hi" }] }, { headers: { Cookie: "mh_chat=v1.aaa.bbb.ccc.ddd" } });
    expect(r.res.status).toBe(401);
  });

  it("refuses foreign or missing origins, wrong content types, oversized and malformed bodies", async () => {
    expect((await chat(first, { headers: { Origin: "https://evil.example" } })).res.status).toBe(403);
    const noOrigin = new Request(`${ORIGIN}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(first) });
    expect((await handleChat(noOrigin, makeEnv(), makeCtx())).status).toBe(403);
    expect((await chat(first, { headers: { "Content-Type": "text/plain" } })).res.status).toBe(415);
    expect((await chat({ ...first, messages: [{ role: "user", content: "x".repeat(33_000) }] })).res.status).toBe(413);
    expect((await chat("{not json")).res.status).toBe(400);
    expect((await chat({ messages: [{ role: "assistant", content: "hi" }] })).res.status).toBe(400);
  });

  it("rate limits per IP with Retry-After, before Turnstile or Gemini are touched", async () => {
    const env = makeEnv({ RL_CHAT_BURST: fakeLimiter(3) as unknown as RateLimit, RL_CHAT: fakeLimiter(8) as unknown as RateLimit });
    const siteverify = stubSiteverify();
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await chat({ messages: [{ role: "user", content: "hi" }] }, { env });
      statuses.push(r.res.status);
      if (r.res.status === 429) {
        expect(r.res.headers.get("Retry-After")).toBe("10");
        expect(await r.res.json()).toMatchObject({ error: "rate_limited", retryAfter: 10 });
      }
    }
    expect(statuses).toEqual([401, 401, 401, 429]);
    expect(siteverify).not.toHaveBeenCalled();
  });

  it("X-Model-Chain picks the models only where ALLOW_MODEL_OVERRIDE=1 (local dev / eval), never by default", async () => {
    const urlOf = (f: ReturnType<typeof gemini>) => String((f.mock.calls[0] as unknown as [string])[0]);
    const prod = await chat(first, { headers: { "X-Model-Chain": "gemini-3.5-flash-lite" } });
    await readSse(prod.res);
    expect(urlOf(prod.fetcher)).toContain("/models/gemini-3.8-flash:");
    const dev = await chat(first, { env: makeEnv({ ALLOW_MODEL_OVERRIDE: "1" }), headers: { "X-Model-Chain": "evil/../x, gemini-3.5-flash-lite" } });
    await readSse(dev.res);
    expect(urlOf(dev.fetcher)).toContain("/models/gemini-3.5-flash-lite:");
  });

  it("503 when the Worker is not configured (no key)", async () => {
    expect((await chat(first, { env: makeEnv({ GEMINI_API_KEY: undefined }) })).res.status).toBe(503);
  });

  it("CORS: preflight only for allowed origins; responses echo the allowed origin", async () => {
    const env = makeEnv();
    const ok = await worker.fetch(new Request(`${ORIGIN}/api/chat`, { method: "OPTIONS", headers: { Origin: "https://www.mohamedhatem.dev" } }), env, makeCtx());
    expect(ok.status).toBe(204);
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe("https://www.mohamedhatem.dev");
    const bad = await worker.fetch(new Request(`${ORIGIN}/api/chat`, { method: "OPTIONS", headers: { Origin: "https://evil.example" } }), env, makeCtx());
    expect(bad.status).toBe(403);
    expect(bad.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("routes: 405 for GET /api/chat, 404 JSON for unknown API paths, health check, assets otherwise", async () => {
    const env = makeEnv();
    expect((await worker.fetch(new Request(`${ORIGIN}/api/chat`), env, makeCtx())).status).toBe(405);
    const nf = await worker.fetch(new Request(`${ORIGIN}/api/nope`), env, makeCtx());
    expect(nf.status).toBe(404);
    expect(nf.headers.get("Content-Type")).toContain("application/json");
    const health = await worker.fetch(new Request(`${ORIGIN}/api/health`), env, makeCtx());
    expect(await health.json()).toMatchObject({ ok: true, version: expect.any(String) });
    expect(await (await worker.fetch(new Request(`${ORIGIN}/about`), env, makeCtx())).text()).toBe("asset");
  });
});

/* ------------------------------------------------------------------ contact */

const validContact = {
  name: "Sara Recruiter",
  email: "sara@example.com",
  company: "Acme AI",
  subject: "hiring",
  message: "We have a Senior AI Engineer role that fits your profile.",
  turnstileToken: "tok",
  mh_hp: "",
  lang: "en",
};

function contactRequest(body: unknown, headers: Record<string, string> = {}) {
  const isForm = body instanceof URLSearchParams;
  return new Request(`${ORIGIN}/api/contact`, {
    method: "POST",
    headers: { "Content-Type": isForm ? "application/x-www-form-urlencoded" : "application/json", Origin: ORIGIN, "CF-Connecting-IP": "198.51.100.4", ...headers },
    body: isForm ? body.toString() : JSON.stringify(body),
  });
}

describe("contact validation", () => {
  const v = (patch: Record<string, unknown>) => validateContact((k) => ({ ...validContact, ...patch })[k as keyof typeof validContact]);

  it("accepts a valid message and normalises it", () => {
    const r = v({ name: "  Sara \n Recruiter ", email: "Sara@Example.COM" });
    expect(r.ok && r.value.data).toEqual({ name: "Sara Recruiter", email: "sara@example.com", company: "Acme AI", subject: "hiring", message: validContact.message, lang: "en" });
  });

  it("flags each invalid field", () => {
    expect(v({ name: "S" })).toEqual({ ok: false, fields: ["name"] });
    for (const email of ["", "no-at", "a@b", "a b@c.com", "a@b..com", "x@y.c", "<a@b.com>", "a@b.com\r\nBcc: x@y.com"]) {
      expect(v({ email })).toEqual({ ok: false, fields: ["email"] });
    }
    expect(v({ subject: "spam" })).toEqual({ ok: false, fields: ["subject"] });
    expect(v({ message: "short" })).toEqual({ ok: false, fields: ["message"] });
    expect(v({ message: "x".repeat(5001) })).toEqual({ ok: false, fields: ["message"] });
    expect(v({ company: "c".repeat(121) })).toEqual({ ok: false, fields: ["company"] });
  });

  it("references look like MH-YYMMDD-XXXXX", () => {
    expect(contactRef(new Date("2026-10-09T10:00:00Z"))).toMatch(/^MH-261009-[2-9A-HJ-NP-Z]{5}$/);
  });
});

describe("contact email (send_email message)", () => {
  const data = { name: "Sara <script>", email: "sara@example.com", company: "Acme & Co", subject: "project" as const, message: "Line 1\n<b>Line 2</b>", lang: "ar" as const };
  const meta = { ref: "MH-261009-ABCDE", from: "website@mohamedhatem.dev", to: "mhatem5351@gmail.com", receivedAt: new Date("2026-10-09T10:30:00Z"), country: "SA" };

  it("addresses it from the site, to the owner, with Reply-To set to the visitor", () => {
    const m = buildContactEmail(data, meta);
    expect(m.from).toEqual({ email: "website@mohamedhatem.dev", name: "mohamedhatem.dev" });
    expect(m.to).toBe("mhatem5351@gmail.com");
    expect(m.replyTo).toEqual({ email: "sara@example.com", name: "Sara <script>" });
    expect(m.headers).toEqual({ "X-Contact-Ref": "MH-261009-ABCDE" });
    expect(m.subject).toBe("[mohamedhatem.dev] Project / consulting: Sara <script> (Acme & Co) · MH-261009-ABCDE");
  });

  it("plain-text part lists every field and the message verbatim", () => {
    const { text } = buildContactEmail(data, meta);
    for (const s of ["Name: Sara <script>", "Email: sara@example.com", "Company: Acme & Co", "Subject: Project / consulting", "Site language: Arabic", "Country (network): SA", "Received: 2026-10-09 10:30 UTC", "Reference: MH-261009-ABCDE", "Line 1\n<b>Line 2</b>"]) {
      expect(text).toContain(s);
    }
  });

  it("HTML part escapes everything the visitor typed", () => {
    const { html } = buildContactEmail(data, meta);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Line 2</b>");
    expect(html).toContain("Sara &lt;script&gt;");
    expect(html).toContain("&lt;b&gt;Line 2&lt;/b&gt;");
    expect(html).toContain('dir="auto"');
    expect(escapeHtml(`"'&<>`)).toBe("&quot;&#39;&amp;&lt;&gt;");
  });

  it("subject can never carry a header break", () => {
    const m = buildContactEmail({ ...data, name: "Eve\r\nBcc: victim@example.com", company: "" }, meta);
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.replyTo.name).not.toMatch(/[\r\n]/);
  });
});

describe("POST /api/contact", () => {
  it("validates, verifies Turnstile (action contact), sends one email and returns { ok, ref }", async () => {
    const siteverify = stubSiteverify({ success: true, hostname: "mohamedhatem.dev", action: "contact" });
    const env = makeEnv();
    const res = await worker.fetch(contactRequest(validContact), env, makeCtx());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; ref: string };
    expect(body.ok).toBe(true);
    expect(body.ref).toMatch(/^MH-\d{6}-[2-9A-Z]{5}$/);
    expect(siteverify).toHaveBeenCalledOnce();
    expect(env.sent).toHaveLength(1);
    expect(env.sent[0]).toMatchObject({ to: "mhatem5351@gmail.com", replyTo: { email: "sara@example.com" } });
  });

  it("accepts a classic form post (cf-turnstile-response field)", async () => {
    stubSiteverify({ success: true, hostname: "mohamedhatem.dev", action: "contact" });
    const env = makeEnv();
    const form = new URLSearchParams({ ...validContact, turnstileToken: "", "cf-turnstile-response": "tok" });
    const res = await worker.fetch(contactRequest(form), env, makeCtx());
    expect(res.status).toBe(200);
    expect(env.sent).toHaveLength(1);
  });

  it("honeypot: pretends success, sends nothing, never calls Turnstile", async () => {
    const siteverify = stubSiteverify();
    const env = makeEnv();
    const res = await worker.fetch(contactRequest({ ...validContact, mh_hp: "http://spam.example" }), env, makeCtx());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(env.sent).toHaveLength(0);
    expect(siteverify).not.toHaveBeenCalled();
  });

  it("422 with the invalid field names", async () => {
    const res = await worker.fetch(contactRequest({ ...validContact, email: "nope", message: "x" }), makeEnv(), makeCtx());
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ ok: false, error: "invalid", fields: ["email", "message"] });
  });

  it("403 when Turnstile fails or comes from the chat action", async () => {
    stubSiteverify({ success: true, hostname: "mohamedhatem.dev", action: "chat" });
    const env = makeEnv();
    const res = await worker.fetch(contactRequest(validContact), env, makeCtx());
    expect(res.status).toBe(403);
    expect(env.sent).toHaveLength(0);
  });

  it("502 send_failed when the email binding throws", async () => {
    stubSiteverify({ success: true, hostname: "mohamedhatem.dev", action: "contact" });
    const env = makeEnv({ MAIL: { send: async () => Promise.reject(new Error("destination not verified")) } as unknown as SendEmail });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await worker.fetch(contactRequest(validContact), env, makeCtx());
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ ok: false, error: "send_failed" });
  });

  it("rate limited (3 a minute per IP), foreign origin refused, unsupported type refused", async () => {
    stubSiteverify({ success: true, hostname: "mohamedhatem.dev", action: "contact" });
    const env = makeEnv({ RL_CONTACT: fakeLimiter(3) as unknown as RateLimit });
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await worker.fetch(contactRequest(validContact), env, makeCtx())).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
    expect((await worker.fetch(contactRequest(validContact, { Origin: "https://evil.example" }), makeEnv(), makeCtx())).status).toBe(403);
    expect((await worker.fetch(contactRequest(validContact, { "Content-Type": "text/plain" }), makeEnv(), makeCtx())).status).toBe(415);
  });
});

describe("POST /api/chat: quota abuse controls (SEC-1, SEC-2, AST-05)", () => {
  const first = { messages: [{ role: "user", content: "What does he do?" }], lang: "en", turnstileToken: "tok" };
  const ask = (content = "And before?") => ({ messages: [{ role: "user", content }] });
  const UA = "Mozilla/5.0 (Macintosh) Chrome/141";
  const session = async (env = makeEnv(), ip = "203.0.113.7") => {
    const r = await chat(first, { env, headers: { "CF-Connecting-IP": ip, "User-Agent": UA } });
    await readSse(r.res);
    return r.res.headers.get("Set-Cookie")!.split(";")[0]!;
  };

  it("the site-wide limit is never spent by requests that fail before verification", async () => {
    const global = fakeLimiter(100);
    const env = makeEnv({ RL_CHAT_GLOBAL: global as unknown as RateLimit });
    expect((await chat("{not json", { env })).res.status).toBe(400);
    expect((await chat(ask(), { env })).res.status).toBe(401);
    expect((await chat({ ...first, messages: [{ role: "user", content: "x".repeat(33_000) }] }, { env })).res.status).toBe(413);
    expect((await chat(first, { env, headers: { Origin: "https://evil.example" } })).res.status).toBe(403);
    stubSiteverify({ success: false });
    expect((await chat(first, { env })).res.status).toBe(403);
    expect(global.keys).toEqual([]);
    stubSiteverify();
    const ok = await chat(first, { env });
    await readSse(ok.res);
    expect(global.keys).toEqual(["chat:global"]);
  });

  it("when the site-wide limit trips, verified visitors get 503 upstream_busy (busy for everyone), not 'too fast'", async () => {
    const env = makeEnv({ RL_CHAT_GLOBAL: fakeLimiter(0) as unknown as RateLimit });
    const r = await chat(first, { env });
    expect(r.res.status).toBe(503);
    expect(r.res.headers.get("Retry-After")).toBe("60");
    expect(await r.res.json()).toMatchObject({ error: "upstream_busy", retryAfter: 60 });
    expect(r.fetcher).not.toHaveBeenCalled();
  });

  it("a session cookie replayed from another network or another browser needs a new Turnstile check", async () => {
    const env = makeEnv();
    const cookie = await session(env);
    const sameNet = await chat(ask(), { env, headers: { Cookie: cookie, "CF-Connecting-IP": "203.0.113.200", "User-Agent": UA } });
    expect(sameNet.res.status).toBe(200); // a phone moving inside its carrier's /24 keeps the session
    await readSse(sameNet.res);
    const otherNet = await chat(ask(), { env, headers: { Cookie: cookie, "CF-Connecting-IP": "198.51.100.7", "User-Agent": UA } });
    expect(otherNet.res.status).toBe(401);
    expect(await otherNet.res.json()).toMatchObject({ error: "turnstile_required" });
    const script = await chat(ask(), { env, headers: { Cookie: cookie, "CF-Connecting-IP": "203.0.113.7", "User-Agent": "node" } });
    expect(script.res.status).toBe(401);
    expect(otherNet.fetcher).not.toHaveBeenCalled();
    // The silent re-verify the widget does: a fresh token on the new network starts a new session.
    const again = await chat({ ...ask(), turnstileToken: "tok2" }, { env, headers: { Cookie: cookie, "CF-Connecting-IP": "198.51.100.7", "User-Agent": UA } });
    expect(again.res.status).toBe(200);
    expect(again.res.headers.get("Set-Cookie")).toMatch(/^mh_chat=v2\./);
    await readSse(again.res);
  });

  it("per-session rate limit, keyed by the session (it follows the visitor, not the IP)", async () => {
    const perSession = fakeLimiter(1);
    const env = makeEnv({ RL_CHAT_SESSION: perSession as unknown as RateLimit });
    const cookie = await session(env);
    const nonce = cookie.split("=")[1]!.split(".")[3];
    const one = await chat(ask(), { env, headers: { Cookie: cookie, "User-Agent": UA } });
    expect(one.res.status).toBe(200);
    await readSse(one.res);
    const two = await chat(ask(), { env, headers: { Cookie: cookie, "User-Agent": UA } });
    expect(two.res.status).toBe(429);
    expect(await two.res.json()).toMatchObject({ error: "rate_limited", retryAfter: 60 });
    expect(perSession.keys).toEqual([`chat-session:${nonce}`, `chat-session:${nonce}`]);
  });

  it(`after ${SESSION_MESSAGE_CAP} messages a session needs a fresh Turnstile check (per-location budget in the Cache API)`, async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("caches", {
      default: {
        match: async (k: string) => (store.has(k) ? new Response(store.get(k)) : undefined),
        put: async (k: string, r: Response) => void store.set(k, await r.text()),
      },
    });
    const env = makeEnv();
    const cookie = await session(env);
    const key = [...store.keys()].find((k) => k.includes("__chat-session/")) ?? `${ORIGIN}/__chat-session/${cookie.split("=")[1]!.split(".")[3]}`;
    store.set(key, String(SESSION_MESSAGE_CAP - 1));
    const last = await chat(ask(), { env, headers: { Cookie: cookie, "User-Agent": UA } });
    expect(last.res.status).toBe(200);
    await readSse(last.res);
    await Promise.all(last.ctx.pending);
    const over = await chat(ask(), { env, headers: { Cookie: cookie, "User-Agent": UA } });
    expect(over.res.status).toBe(401);
  });

  it("Turnstile's test secret is refused unless ALLOW_TURNSTILE_TEST=1 (local dev); test-key results too", async () => {
    stubSiteverify({ success: true, hostname: "example.com", metadata: { result_with_testing_key: true } });
    const prod = await chat(first, { env: makeEnv({ TURNSTILE_SECRET: "1x0000000000000000000000000000000AA" }) });
    expect(prod.res.status).toBe(403);
    const realSecretTestToken = await chat(first, { env: makeEnv() });
    expect(realSecretTestToken.res.status).toBe(403);
    const dev = await chat(first, { env: makeEnv({ TURNSTILE_SECRET: "1x0000000000000000000000000000000AA", ALLOW_TURNSTILE_TEST: "1" }) });
    expect(dev.res.status).toBe(200);
    await readSse(dev.res);
  });
});

describe("POST /api/chat: per-turn wiring", () => {
  const body = (content: string) => ({ messages: [{ role: "user", content }], lang: "en", turnstileToken: "tok" });
  const systemOf = (f: ReturnType<typeof gemini>) => JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body)).systemInstruction.parts[0].text as string;

  it("a 6,000-character job description reaches the model whole; a longer one is cut visibly (meta.trimmed)", async () => {
    const jd = `Is he a fit?\n\nRequirements:\n${"- Python and LangGraph in production\n".repeat(160)}`.slice(0, 5900);
    const whole = await chat(body(jd));
    const events = await readSse(whole.res);
    expect(events[0]!.data.trimmed).toBeUndefined();
    const sent = JSON.parse(String((whole.fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body)).contents.at(-1).parts[0].text;
    expect(sent).toContain(jd.slice(-200));
    expect(systemOf(whole.fetcher)).toContain("# This message asks about his fit for a role");

    const long = await chat(body("y".repeat(7000)));
    expect((await readSse(long.res))[0]!.data.trimmed).toBe(6000);
  });

  it("the contact card is shown only for contact or hiring questions", async () => {
    const answer = () => vi.fn(async () => geminiSse([textChunk('Not stated.<ui>{"contact":"general","section":null,"followups":[]}</ui>'), finalChunk()]));
    const metric = await chat(body("By what percentage did AIP v2 improve accuracy?"), { fetcher: answer() });
    expect((await readSse(metric.res)).some((e) => e.event === "tool")).toBe(false);
    const contact = await chat(body("How can I reach him on WhatsApp?"), { fetcher: answer() });
    expect((await readSse(contact.res)).find((e) => e.event === "tool")?.data.name).toBe("show_contact_card");
  });
});
