import { describe, expect, it, vi } from "vitest";
import { clientKey, networkKey } from "../src/http";
import { checkLimits } from "../src/ratelimit";
import { checkSession, nextExpiry, readCookie, SESSION_MAX_S, SESSION_TTL_S, sessionBinding, sessionCookie, signSession } from "../src/session";
import { verifyTurnstile } from "../src/turnstile";
import { fakeLimiter } from "./helpers";

describe("rate limits", () => {
  it("passes when every rule allows", async () => {
    const a = fakeLimiter(5);
    const b = fakeLimiter(5);
    expect(await checkLimits([{ binding: a, key: "a", retryAfter: 10 }, { binding: b, key: "b", retryAfter: 60 }])).toEqual({ ok: true });
  });

  it("trips on the first failing rule, reports its period and stops consuming later counters", async () => {
    const burst = fakeLimiter(3);
    const minute = fakeLimiter(8);
    const rules = [
      { binding: burst, key: "chat-burst:1.2.3.4", retryAfter: 10 },
      { binding: minute, key: "chat:1.2.3.4", retryAfter: 60 },
    ];
    for (let i = 0; i < 3; i++) expect((await checkLimits(rules)).ok).toBe(true);
    expect(await checkLimits(rules)).toEqual({ ok: false, retryAfter: 10, rule: 0 });
    expect(minute.keys.length).toBe(3);
  });

  it("8 per minute", async () => {
    const minute = fakeLimiter(8);
    const results = [];
    for (let i = 0; i < 9; i++) results.push((await checkLimits([{ binding: minute, key: "k", retryAfter: 60 }])).ok);
    expect(results.filter(Boolean).length).toBe(8);
    expect(results.at(-1)).toBe(false);
  });

  it("fails open without a binding or when the binding throws", async () => {
    const broken = { limit: vi.fn().mockRejectedValue(new Error("down")) };
    expect(await checkLimits([{ binding: undefined, key: "x", retryAfter: 60 }, { binding: broken, key: "y", retryAfter: 60 }])).toEqual({ ok: true });
  });

  it("keys IPv4 by address and IPv6 by /64 prefix", () => {
    const req = (ip: string) => new Request("https://x/", { headers: { "CF-Connecting-IP": ip } });
    expect(clientKey(req("203.0.113.9"))).toBe("203.0.113.9");
    expect(clientKey(req("2001:db8:85a3:1:aaaa:bbbb:cccc:dddd"))).toBe("2001:db8:85a3:1::/64");
    expect(clientKey(req("2001:db8:85a3:1::7"))).toBe(clientKey(req("2001:0db8:85a3:0001:ffff::1")));
    expect(clientKey(req("2001:db8::1"))).toBe("2001:db8:0:0::/64");
    expect(clientKey(new Request("https://x/"))).toBe("unknown");
  });
});

describe("session tokens (HMAC, bound to network and browser)", () => {
  const secret = "s3cret-s3cret-s3cret";
  const now = 1_790_000_000;
  const UA = "Mozilla/5.0 (Macintosh) Chrome/141";
  let bind = "";
  const sign = (iat: number, exp: number, b = bind, nonce?: string) => signSession(secret, iat, exp, b, nonce);

  it("round-trips, keeping the nonce when refreshed", async () => {
    bind = await sessionBinding(secret, "203.0.113.0/24", UA);
    expect(bind).toMatch(/^[A-Za-z0-9_-]{12}$/);
    const token = await sign(now, now + SESSION_TTL_S);
    expect(token).toMatch(/^v2\.[0-9a-z]+\.[0-9a-z]+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{12}\.[A-Za-z0-9_-]{43}$/);
    const check = await checkSession(secret, token, now + 10, bind);
    expect(check).toEqual({ ok: true, session: { iat: now, exp: now + SESSION_TTL_S, nonce: token.split(".")[3] } });
    const refreshed = await sign(now, now + SESSION_MAX_S, bind, token.split(".")[3]);
    expect(refreshed.split(".")[3]).toBe(token.split(".")[3]);
  });

  it("a cookie replayed from another network or another browser is 'moved' (the widget re-verifies silently)", async () => {
    const token = await sign(now, now + SESSION_TTL_S);
    const otherNet = await sessionBinding(secret, "198.51.100.0/24", UA);
    const otherUa = await sessionBinding(secret, "203.0.113.0/24", "node");
    expect(await checkSession(secret, token, now, otherNet)).toEqual({ ok: false, reason: "moved" });
    expect(await checkSession(secret, token, now, otherUa)).toEqual({ ok: false, reason: "moved" });
    // The binding is keyed with the secret: the cookie doesn't reveal the network, and another secret binds differently.
    expect(await sessionBinding("other-secret", "203.0.113.0/24", UA)).not.toBe(bind);
  });

  it("rejects tampering, a wrong secret, expiry, old v1 tokens and malformed tokens", async () => {
    const token = await sign(now, now + SESSION_TTL_S);
    const parts = token.split(".");
    const longer = [parts[0], parts[1], (now + SESSION_MAX_S).toString(36), parts[3], parts[4], parts[5]].join(".");
    expect((await checkSession(secret, longer, now, bind)).ok).toBe(false);
    const rebound = [parts[0], parts[1], parts[2], parts[3], "AAAAAAAAAAAA", parts[5]].join(".");
    expect(await checkSession(secret, rebound, now, "AAAAAAAAAAAA")).toEqual({ ok: false, reason: "invalid" });
    const flipped = token.slice(0, -2) + (token.endsWith("AA") ? "BB" : "AA");
    expect(await checkSession(secret, flipped, now, bind)).toEqual({ ok: false, reason: "invalid" });
    expect(await checkSession("other-secret", token, now, bind)).toEqual({ ok: false, reason: "invalid" });
    expect(await checkSession(secret, token, now + SESSION_TTL_S, bind)).toEqual({ ok: false, reason: "expired" });
    expect(await checkSession(secret, null, now, bind)).toEqual({ ok: false, reason: "missing" });
    for (const bad of ["v1.a.b.c.d", "v2.a.b.c.d.e", "v2.zz.zz.zz.zz.!!", "x".repeat(300)]) expect((await checkSession(secret, bad, now, bind)).ok).toBe(false);
  });

  it("rejects sessions issued in the future or older than the 1 h maximum", async () => {
    expect(SESSION_MAX_S).toBe(3600);
    const future = await sign(now + 3600, now + 3600 + SESSION_TTL_S);
    expect((await checkSession(secret, future, now, bind)).ok).toBe(false);
    const tooLong = await sign(now, now + SESSION_MAX_S + 60);
    expect((await checkSession(secret, tooLong, now + 10, bind)).ok).toBe(false);
    const old = await sign(now, now + SESSION_MAX_S);
    expect((await checkSession(secret, old, now + SESSION_MAX_S - 1, bind)).ok).toBe(true);
    expect(await checkSession(secret, old, now + SESSION_MAX_S, bind)).toEqual({ ok: false, reason: "expired" });
  });

  it("slides the expiry once half the TTL is used, capped at iat + 1 h", () => {
    const s = (exp: number) => ({ iat: now, exp, nonce: "n" });
    expect(nextExpiry(null, now)).toEqual({ iat: now, exp: now + SESSION_TTL_S });
    expect(nextExpiry(s(now + SESSION_TTL_S), now + 60)).toBeNull();
    expect(nextExpiry(s(now + SESSION_TTL_S), now + SESSION_TTL_S - 60)).toEqual({ iat: now, exp: now + 2 * SESSION_TTL_S - 60 });
    expect(nextExpiry(s(now + SESSION_TTL_S + 300), now + SESSION_TTL_S + 120)).toEqual({ iat: now, exp: now + SESSION_MAX_S });
    expect(nextExpiry(s(now + SESSION_MAX_S), now + SESSION_MAX_S - 60)).toBeNull();
  });

  it("binds IPv4 by /24 and IPv6 by /48 (a phone moving inside its carrier's range keeps its session)", () => {
    const req = (ip: string) => new Request("https://x/", { headers: { "CF-Connecting-IP": ip } });
    expect(networkKey(req("203.0.113.9"))).toBe("203.0.113.0/24");
    expect(networkKey(req("203.0.113.200"))).toBe(networkKey(req("203.0.113.9")));
    expect(networkKey(req("2001:db8:85a3:1:aaaa::1"))).toBe("2001:db8:85a3::/48");
    expect(networkKey(req("2001:db8:85a3:ffff::7"))).toBe(networkKey(req("2001:db8:85a3:1::1")));
    expect(networkKey(req("2001:db8:85a4::1"))).not.toBe(networkKey(req("2001:db8:85a3::1")));
  });

  it("writes an HttpOnly, SameSite=Strict, path-scoped cookie and reads it back", () => {
    const c = sessionCookie("v1.tok", 1800, true);
    expect(c).toBe("mh_chat=v1.tok; Path=/api/chat; Max-Age=1800; HttpOnly; Secure; SameSite=Strict");
    expect(sessionCookie("t", 5, false)).not.toContain("Secure");
    const req = new Request("https://x/", { headers: { Cookie: "a=1; mh_chat=v1.tok; b=2" } });
    expect(readCookie(req, "mh_chat")).toBe("v1.tok");
    expect(readCookie(new Request("https://x/"), "mh_chat")).toBeNull();
  });
});

describe("Turnstile verification", () => {
  const base = { secret: "sec", token: "tok", ip: "203.0.113.9", action: "chat", hostnames: ["mohamedhatem.dev"] };
  const reply = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it("passes a valid token for our hostname and action, forwarding the IP", async () => {
    const fetcher = reply({ success: true, hostname: "mohamedhatem.dev", action: "chat" });
    expect(await verifyTurnstile({ ...base, fetcher })).toEqual({ ok: true, testKey: false });
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ secret: "sec", response: "tok", remoteip: "203.0.113.9" });
  });

  it("fails on rejection, wrong hostname, wrong action, HTTP errors and network errors (fail closed)", async () => {
    expect((await verifyTurnstile({ ...base, fetcher: reply({ success: false, "error-codes": ["timeout-or-duplicate"] }) })).ok).toBe(false);
    expect(await verifyTurnstile({ ...base, fetcher: reply({ success: true, hostname: "evil.example", action: "chat" }) })).toEqual({ ok: false, reason: "hostname" });
    expect(await verifyTurnstile({ ...base, fetcher: reply({ success: true, hostname: "mohamedhatem.dev", action: "contact" }) })).toEqual({ ok: false, reason: "action" });
    expect((await verifyTurnstile({ ...base, fetcher: reply({}, 500) })).ok).toBe(false);
    expect(await verifyTurnstile({ ...base, fetcher: vi.fn().mockRejectedValue(new Error("x")) })).toEqual({ ok: false, reason: "network" });
  });

  it("never calls siteverify without a secret or with an oversized token", async () => {
    const fetcher = reply({ success: true });
    expect((await verifyTurnstile({ ...base, secret: undefined, fetcher })).ok).toBe(false);
    expect((await verifyTurnstile({ ...base, token: "x".repeat(2049), fetcher })).ok).toBe(false);
    expect((await verifyTurnstile({ ...base, token: "", fetcher })).ok).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects Cloudflare test-key results by default; accepts them only in local development", async () => {
    const fetcher = reply({ success: true, hostname: "example.com", metadata: { result_with_testing_key: true } });
    expect(await verifyTurnstile({ ...base, fetcher })).toEqual({ ok: false, reason: "test-key" });
    expect(await verifyTurnstile({ ...base, fetcher, allowTestKey: true })).toEqual({ ok: true, testKey: true });
  });

  it("refuses Cloudflare's test secrets outside local development, before any network call", async () => {
    const fetcher = reply({ success: true, hostname: "mohamedhatem.dev", action: "chat" });
    for (const secret of ["1x0000000000000000000000000000000AA", "2x0000000000000000000000000000000AA", "3x0000000000000000000000000000000AA"])
      expect(await verifyTurnstile({ ...base, secret, fetcher })).toEqual({ ok: false, reason: "test-secret" });
    expect(fetcher).not.toHaveBeenCalled();
    expect((await verifyTurnstile({ ...base, secret: "1x0000000000000000000000000000000AA", fetcher, allowTestKey: true })).ok).toBe(true);
  });

  it("requires the hostname a real token was solved on", async () => {
    expect(await verifyTurnstile({ ...base, fetcher: reply({ success: true, action: "chat" }) })).toEqual({ ok: false, reason: "hostname" });
  });
});
