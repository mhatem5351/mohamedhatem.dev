import type { ToolEvent } from "../../worker/src/chat/protocol";

/** One message as the widget keeps it (more than the wire format: tool payloads and display state). */
export interface Entry {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools?: ToolEvent[];
  status?: "streaming" | "done" | "stopped" | "error";
  /** The model hit its output cap (done.finish "length"): the answer may be incomplete. */
  cut?: boolean;
  /** `until`: epoch ms when a rate limit lifts (drives the Retry countdown). */
  error?: { code: string; until?: number };
}

const MAX_ENTRIES = 40;

/** sessionStorage, guarded: private modes and blocked storage throw or return null; the chat then just won't persist. */
function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadEntries(key: string): Entry[] {
  try {
    const raw = storage()?.getItem(`${key}:log`);
    const data = raw ? (JSON.parse(raw) as { v: number; entries: Entry[] }) : null;
    if (data?.v !== 1 || !Array.isArray(data.entries)) return [];
    return data.entries
      .filter((e) => e && (e.role === "user" || e.role === "assistant") && typeof e.content === "string")
      .map((e) => (e.status === "streaming" ? { ...e, status: "stopped" as const } : e));
  } catch {
    return [];
  }
}

export function saveEntries(key: string, entries: Entry[]): void {
  try {
    const kept = entries.slice(-MAX_ENTRIES).map((e) => (e.status === "streaming" ? { ...e, status: "stopped" as const } : e));
    storage()?.setItem(`${key}:log`, JSON.stringify({ v: 1, entries: kept }));
  } catch {
    /* quota or disabled storage: keep going without persistence */
  }
}

/** Session expiry (epoch ms) from the Worker's `meta` event; the cookie itself is HttpOnly. */
export function getSessionExp(key: string): number {
  try {
    return Number(storage()?.getItem(`${key}:sx`)) || 0;
  } catch {
    return 0;
  }
}

export function setSessionExp(key: string, exp: number | null): void {
  try {
    if (exp) storage()?.setItem(`${key}:sx`, String(exp));
    else storage()?.removeItem(`${key}:sx`);
  } catch {
    /* ignore */
  }
}
