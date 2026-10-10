import { describe, expect, it, vi } from "vitest";
import { clientKey } from "../src/http";
import { checkLimits } from "../src/ratelimit";
import { nextExpiry, readCookie, SESSION_MAX_S, SESSION_TTL_S, sessionCookie, signSession, verifySession } from "../src/session";
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

describe("session tokens (HMAC)", () => {
  const secret = "s3cret-s3cret-s3cret";
  const now = 1_790_000_000;

  it("round-trips", async () => {
    const token = await signSession(secret, now, now + SESSION_TTL_S);
    expect(token).toMatch(/^v1\.[0-9a-z]+\.[0-9a-z]+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{43}$/);
    expect(await verifySession(secret, token, now + 10)).toEqual({ iat: now, exp: now + SESSION_TTL_S });
  });

  it("rejects tampering, a wrong secret, expiry and malformed tokens", async () => {
    const token = await signSession(secret, now, now + SESSION_TTL_S);
    const parts = token.split(".");
    const longer = [parts[0], parts[1], (now + SESSION_MAX_S).toString(36), parts[3], parts[4]].join(".");
    expect(await verifySession(secret, longer, now)).toBeNull();
    const flipped = token.slice(0, -2) + (token.endsWith("AA") ? "BB" : "AA");
    expect(await verifySession(secret, flipped, now)).toBeNull();
    expect(await verifySession("other-secret", token, now)).toBeNull();
    expect(await verifySession(secret, token, now + SESSION_TTL_S)).toBeNull();
    for (const bad of [null, "", "v1.a.b", "v2.a.b.c.d", "v1.zz.zz.zz.!!", "x".repeat(300)]) expect(await verifySession(secret, bad, now)).toBeNull();
  });

  it("rejects sessions issued in the future or older than the 2 h maximum", async () => {
    const future = await signSession(secret, now + 3600, now + 3600 + SESSION_TTL_S);
    expect(await verifySession(secret, future, now)).toBeNull();
    const tooLong = await signSession(secret, now, now + SESSION_MAX_S + 60);
    expect(await verifySession(secret, tooLong, now + 10)).toBeNull();
    const old = await signSession(secret, now, now + SESSION_MAX_S);
    expect(await verifySession(secret, old, now + SESSION_MAX_S - 1)).not.toBeNull();
  });

  it("slides the expiry once half the TTL is used, capped at iat + 2 h", () => {
    expect(nextExpiry(null, now)).toEqual({ iat: now, exp: now + SESSION_TTL_S });
    expect(nextExpiry({ iat: now, exp: now + SESSION_TTL_S }, now + 60)).toBeNull();
    expect(nextExpiry({ iat: now, exp: now + SESSION_TTL_S }, now + SESSION_TTL_S - 60)).toEqual({ iat: now, exp: now + 2 * SESSION_TTL_S - 60 });
    expect(nextExpiry({ iat: now, exp: now + SESSION_MAX_S }, now + SESSION_MAX_S - 60)).toBeNull();
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

  it("accepts Cloudflare test-key results (local dev) regardless of hostname", async () => {
    const fetcher = reply({ success: true, hostname: "example.com", metadata: { result_with_testing_key: true } });
    expect(await verifyTurnstile({ ...base, fetcher })).toEqual({ ok: true, testKey: true });
  });
});
