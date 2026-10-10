/**
 * Anonymous usage events → Workers Analytics Engine (dataset mh_events). Never message text, never an IP.
 *
 * Schema (positional, keep stable; query with the SQL API, see worker/README.md):
 *   index1  kind               "chat" | "contact"
 *   blob1   kind
 *   blob2   outcome            "ok" | an ErrorCode | "honeypot" | "invalid" | "send_failed"
 *   blob3   lang               "en" | "ar" | ""
 *   blob4   model              model that answered ("" when none)
 *   blob5   finish             "stop" | "length" | "tools" | ""
 *   blob6   tools              comma-separated tool names called, e.g. "show_contact_card,suggest_followups"
 *   blob7   content version    sha of system prompt + knowledge
 *   blob8   country            request.cf.country (2 letters) or ""
 *   double1 count (1) · double2 total ms · double3 first-token ms (-1 none) · double4 input tokens
 *   double5 output tokens · double6 thinking tokens · double7 cached tokens · double8 messages in request
 *   double9 visitor message chars · double10 answer chars · double11 1 if the fallback model answered
 */
export interface ChatEvent {
  kind: "chat" | "contact";
  outcome: string;
  lang?: string;
  model?: string;
  finish?: string;
  tools?: string[];
  version?: string;
  country?: string;
  totalMs?: number;
  firstMs?: number | null;
  input?: number;
  output?: number;
  thoughts?: number;
  cached?: number;
  messages?: number;
  userChars?: number;
  answerChars?: number;
  fallback?: boolean;
}

export function track(dataset: AnalyticsEngineDataset | undefined, e: ChatEvent): void {
  if (!dataset) return;
  try {
    dataset.writeDataPoint({
      indexes: [e.kind],
      blobs: [e.kind, e.outcome, e.lang ?? "", e.model ?? "", e.finish ?? "", (e.tools ?? []).join(","), e.version ?? "", e.country ?? ""],
      doubles: [
        1,
        Math.round(e.totalMs ?? 0),
        e.firstMs == null ? -1 : Math.round(e.firstMs),
        e.input ?? 0,
        e.output ?? 0,
        e.thoughts ?? 0,
        e.cached ?? 0,
        e.messages ?? 0,
        e.userChars ?? 0,
        e.answerChars ?? 0,
        e.fallback ? 1 : 0,
      ],
    });
  } catch {
    /* analytics must never break a response */
  }
}

export function countryOf(req: Request): string {
  const cc = (req as Request & { cf?: { country?: unknown } }).cf?.country;
  return typeof cc === "string" && /^[A-Z]{2}$/.test(cc) ? cc : "";
}
