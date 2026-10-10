import { countryOf, track } from "../analytics";
import type { ContactResponse } from "../chat/protocol";
import type { Env } from "../env";
import { allowedHostnames, clientKey, json, originProblem, parseJsonBytes, readCapped } from "../http";
import { checkLimits } from "../ratelimit";
import { verifyTurnstile } from "../turnstile";
import { buildContactEmail } from "./email";
import { CONTACT_MAX_BODY, contactRef, validateContact } from "./validate";

/**
 * POST /api/contact → { ok: true, ref } | { ok: false, error, message, fields? }.
 * origin → rate limit → size → parse (JSON or form) → honeypot → validation → Turnstile → send_email.
 */
export async function handleContact(req: Request, env: Env): Promise<Response> {
  const t0 = Date.now();
  const country = countryOf(req);
  const reply = (status: number, body: ContactResponse, extra: Record<string, string> = {}) => {
    track(env.EVENTS, { kind: "contact", outcome: body.ok ? "ok" : body.error, country, totalMs: Date.now() - t0 });
    return json(req, env, status, body, extra);
  };

  if (originProblem(req, env)) return reply(403, { ok: false, error: "forbidden", message: "Forbidden" });

  const limited = await checkLimits([{ binding: env.RL_CONTACT, key: `contact:${clientKey(req)}`, retryAfter: 60 }]);
  if (!limited.ok) {
    return reply(
      429,
      { ok: false, error: "rate_limited", message: "Too many messages. Please wait a minute and try again.", retryAfter: limited.retryAfter },
      { "Retry-After": String(limited.retryAfter) },
    );
  }

  const type = req.headers.get("Content-Type") ?? "";
  const isJson = /^application\/json\b/i.test(type);
  const isForm = /^(application\/x-www-form-urlencoded|multipart\/form-data)\b/i.test(type);
  if (!isJson && !isForm) return reply(415, { ok: false, error: "unsupported", message: "Unsupported request format." });

  const body = await readCapped(req, CONTACT_MAX_BODY);
  if (!body.ok) return reply(body.code === "too_large" ? 413 : 400, { ok: false, error: body.code, message: "That message is too large." });

  let get: (k: string) => unknown;
  if (isJson) {
    const data = parseJsonBytes(body.bytes);
    if (!data || typeof data !== "object" || Array.isArray(data)) return reply(400, { ok: false, error: "bad_request", message: "Invalid request." });
    get = (k) => (data as Record<string, unknown>)[k];
  } else {
    let form: FormData;
    try {
      form = await new Response(body.bytes, { headers: { "Content-Type": type } }).formData();
    } catch {
      return reply(400, { ok: false, error: "bad_request", message: "Invalid request." });
    }
    get = (k) => form.get(k);
  }

  // Honeypot first: bots get a convincing success and nothing is sent. Neutral name on purpose: browsers and password
  // managers autofill fields called website/url/company, which would silently drop a real message.
  const honeypot = get("mh_hp");
  if (typeof honeypot === "string" && honeypot.trim()) {
    track(env.EVENTS, { kind: "contact", outcome: "honeypot", country, totalMs: Date.now() - t0 });
    return json(req, env, 200, { ok: true, ref: contactRef() } satisfies ContactResponse);
  }

  const v = validateContact(get);
  if (!v.ok) return reply(422, { ok: false, error: "invalid", message: "Please check the highlighted fields.", fields: v.fields });

  const check = await verifyTurnstile({
    secret: env.TURNSTILE_SECRET,
    token: v.value.turnstileToken,
    ip: req.headers.get("CF-Connecting-IP"),
    action: "contact",
    hostnames: allowedHostnames(req, env),
    allowTestKey: env.ALLOW_TURNSTILE_TEST === "1",
  });
  if (!check.ok) return reply(403, { ok: false, error: "turnstile_failed", message: "The human check did not pass. Please try again." });

  const ref = contactRef();
  const email = buildContactEmail(v.value.data, { ref, from: env.MAIL_FROM, to: env.MAIL_TO, receivedAt: new Date(), country });
  try {
    await env.MAIL.send(email);
  } catch (e) {
    console.error("contact email failed", e instanceof Error ? e.message : "unknown");
    return reply(502, {
      ok: false,
      error: "send_failed",
      message: "Your message could not be sent. Please email hatem@mohamedhatem.dev or use WhatsApp instead.",
    });
  }
  return reply(200, { ok: true, ref });
}
