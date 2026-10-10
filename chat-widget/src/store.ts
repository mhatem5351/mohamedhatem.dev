import type { ToolEvent } from "../../worker/src/chat/protocol";

/** One message as the widget keeps it (more than the wire format: tool payloads and display state). */
export interface Entry {
  role: "user" | "assistant";
  content: string;
  tools?: ToolEvent[];
  status?: "streaming" | "done" | "stopped" | "error";
  /** The model hit its output cap (done.finish "length"): the answer may be incomplete. */
  cut?: boolean;
  /** Visitor message longer than the limit: how many characters of it were sent and read (shown under it). */
  kept?: number;
  /** `until`: epoch ms when a rate limit lifts (drives the Retry countdown). */
  error?: { code: string; until?: number };
}

const MAX_ENTRIES = 40;

/**
 * sessionStorage, guarded: private modes and blocked storage throw (or are full); the chat then just won't persist.
 * A null value removes the item.
 */
function get(name: string): string | null {
  try {
    return sessionStorage.getItem(name);
  } catch {
    return null;
  }
}
function set(name: string, value: string | null): void {
  try {
    if (value) sessionStorage.setItem(name, value);
    else sessionStorage.removeItem(name);
  } catch {
    /* quota or disabled storage: keep going without persistence */
  }
}

export function loadEntries(key: string): Entry[] {
  try {
    const data = JSON.parse(get(`${key}:log`) ?? "0") as { v: number; entries: Entry[] } | 0;
    if (!data || data.v !== 1 || !Array.isArray(data.entries)) return [];
    // Never stored as "streaming": saveEntries() writes an unfinished answer as "stopped".
    return data.entries.filter((e) => e && (e.role === "user" || e.role === "assistant") && typeof e.content === "string");
  } catch {
    return [];
  }
}

export function saveEntries(key: string, entries: Entry[]): void {
  const kept = entries.slice(-MAX_ENTRIES).map((e) => (e.status === "streaming" ? { ...e, status: "stopped" as const } : e));
  set(`${key}:log`, JSON.stringify({ v: 1, entries: kept }));
}

/** Session expiry (epoch ms) from the Worker's `meta` event; the cookie itself is HttpOnly. */
export const getSessionExp = (key: string): number => Number(get(`${key}:sx`)) || 0;

export const setSessionExp = (key: string, exp: number | null): void => set(`${key}:sx`, exp ? String(exp) : null);

/** `${key}:open`: the panel is open, so the next page of this tab reopens it (read by the loader, index.ts). */
export const setOpenFlag = (key: string, open: boolean): void => set(`${key}:open`, open ? "1" : null);
