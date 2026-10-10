import type { Lang } from "../../worker/src/chat/protocol";

interface TurnstileApi {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  reset(id?: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const WAIT_MS = 120_000;

export interface Verifier {
  /** Load Turnstile and start solving in the background (panel opened, no session yet). */
  prepare(): void;
  /** A fresh single-use token (resolves immediately when one is ready). Rejects on error, timeout or abort. */
  token(signal: AbortSignal): Promise<string>;
  /** Forget a token the Worker rejected. */
  discard(): void;
}

/**
 * Turnstile, loaded only when needed, rendered "interaction-only" into a light-DOM container that the panel slots
 * in (iframes inside shadow roots are unreliable). Tokens are single use and valid for 5 minutes; "refresh-expired:
 * auto" keeps a fresh one ready while the visitor types.
 */
export function createVerifier(container: HTMLElement, sitekey: string, lang: Lang, onInteractive: (visible: boolean) => void): Verifier {
  let loading: Promise<TurnstileApi> | null = null;
  let id: string | null = null;
  let ready: string | null = null;
  let solving = false;
  let waiters: { ok: (t: string) => void; fail: (e: Error) => void }[] = [];

  const settle = (token: string | null) => {
    const list = waiters;
    waiters = [];
    for (const w of list) token ? w.ok(token) : w.fail(new Error("turnstile"));
  };

  const load = () =>
    (loading ??= new Promise<TurnstileApi>((resolve, reject) => {
      if (window.turnstile) return resolve(window.turnstile);
      const s = document.createElement("script");
      s.src = SRC;
      s.async = true;
      s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
      s.onerror = () => {
        loading = null;
        s.remove();
        reject(new Error("turnstile"));
      };
      document.head.append(s);
    }));

  async function start() {
    const ts = await load();
    if (id === null) {
      solving = true;
      id = ts.render(container, {
        sitekey,
        action: "chat",
        appearance: "interaction-only",
        "refresh-expired": "auto",
        language: lang === "ar" ? "ar-eg" : "en",
        callback: (t: string) => {
          solving = false;
          onInteractive(false);
          if (waiters.length) settle(t);
          else ready = t;
        },
        "expired-callback": () => (ready = null),
        "error-callback": () => {
          solving = false;
          onInteractive(false);
          settle(null);
        },
        "before-interactive-callback": () => onInteractive(true),
        "after-interactive-callback": () => onInteractive(false),
      });
    } else if (!ready && !solving) {
      solving = true;
      ts.reset(id);
    }
  }

  return {
    prepare() {
      start().catch(() => settle(null));
    },
    token(signal) {
      if (ready) {
        const t = ready;
        ready = null;
        return Promise.resolve(t);
      }
      return new Promise<string>((ok, fail) => {
        const timer = setTimeout(() => done(null), WAIT_MS);
        const abort = () => done(null);
        const done = (t: string | null) => {
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          waiters = waiters.filter((w) => w !== waiter);
          t ? ok(t) : fail(new Error("turnstile"));
        };
        const waiter = { ok: (t: string) => done(t), fail: () => done(null) };
        waiters.push(waiter);
        signal.addEventListener("abort", abort);
        start().catch(() => settle(null));
      });
    },
    discard() {
      ready = null;
    },
  };
}
