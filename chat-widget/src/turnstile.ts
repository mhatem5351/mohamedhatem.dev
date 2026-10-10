import type { Lang } from "../../worker/src/chat/protocol";

interface TurnstileApi {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const WAIT_MS = 120_000;

export interface Verifier {
  /** Load Turnstile and start solving in the background (no chat session yet). */
  prepare(): void;
  /** A fresh single-use token (resolves immediately when one is ready). Rejects on error, timeout or abort. */
  token(signal: AbortSignal): Promise<string>;
  /** Remove the widget and forget any unused token (a session exists): nothing can show until the next prepare() / token(). */
  drop(): void;
}

/**
 * Turnstile, loaded only when a token is needed, rendered "interaction-only" into a light-DOM container that the
 * panel slots in (iframes inside shadow roots are unreliable). The widget only lives while a token is being made:
 * it is removed as soon as its token is handed out, when the token expires unused ("refresh-expired: manual", so
 * there are no background re-challenges) and when a chat session starts. A later 401 renders a fresh one.
 */
export function createVerifier(container: HTMLElement, sitekey: string, lang: Lang, onInteractive: (visible: boolean) => void): Verifier {
  let loading: Promise<TurnstileApi> | null = null;
  let id: string | null = null;
  let ready: string | null = null;
  let waiters: ((token: string | null) => void)[] = [];

  // Removal is deferred so it never runs inside one of Turnstile's own callbacks.
  const drop = () => {
    const old = id;
    if (old !== null) setTimeout(() => window.turnstile?.remove(old));
    id = ready = null;
    onInteractive(false);
  };
  const settle = (token: string | null) => {
    const list = waiters;
    waiters = [];
    for (const w of list) w(token);
  };

  const load = () =>
    (loading ??= new Promise<TurnstileApi>((resolve, reject) => {
      if (window.turnstile) return resolve(window.turnstile);
      const s = document.createElement("script");
      s.src = SRC;
      s.async = true;
      // Loaded without the API, or failed: forget it, so the next attempt loads it again.
      s.onload = s.onerror = () => {
        if (window.turnstile) return resolve(window.turnstile);
        loading = null;
        s.remove();
        reject(new Error("turnstile"));
      };
      document.head.append(s);
    }));

  // One widget at a time: while it exists it is either solving or holding an unused token.
  const start = () =>
    load().then((ts) => {
      id ??= ts.render(container, {
        sitekey,
        action: "chat",
        appearance: "interaction-only",
        "refresh-expired": "manual",
        language: lang === "ar" ? "ar-eg" : "en",
        callback: (t: string) => {
          if (!waiters.length) return void (ready = t);
          drop();
          settle(t);
        },
        "expired-callback": drop,
        "error-callback": () => {
          drop();
          settle(null);
        },
        "before-interactive-callback": () => onInteractive(true),
        "after-interactive-callback": () => onInteractive(false),
      });
    });

  return {
    prepare() {
      start().catch(() => settle(null));
    },
    token(signal) {
      const t = ready;
      if (t) {
        drop();
        return Promise.resolve(t);
      }
      return new Promise<string>((ok, fail) => {
        const done = (t: string | null) => {
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          waiters = waiters.filter((w) => w !== done);
          t ? ok(t) : fail(new Error("turnstile"));
        };
        const abort = () => done(null);
        const timer = setTimeout(abort, WAIT_MS);
        waiters.push(done);
        signal.addEventListener("abort", abort);
        start().catch(() => settle(null));
      });
    },
    drop,
  };
}
