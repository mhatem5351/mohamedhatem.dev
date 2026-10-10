import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createVerifier } from "../../src/turnstile";

type Options = Record<string, unknown> & { callback(t: string): void; "expired-callback"(): void; "error-callback"(): void };

/** A stand-in for Cloudflare's window.turnstile: records renders and removals; tests solve or expire widgets. */
function fakeTurnstile() {
  const widgets = new Map<string, Options>();
  let n = 0;
  const api = {
    renders: [] as Options[],
    removed: [] as string[],
    render(_el: HTMLElement, o: Options) {
      const id = `w${++n}`;
      widgets.set(id, o);
      api.renders.push(o);
      return id;
    },
    remove(id: string) {
      api.removed.push(id);
      widgets.delete(id);
    },
    solve: (token: string) => widgets.get(`w${n}`)!.callback(token),
    expire: () => widgets.get(`w${n}`)!["expired-callback"](),
    fail: () => widgets.get(`w${n}`)!["error-callback"](),
    live: () => [...widgets.keys()],
  };
  return api;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

let ts: ReturnType<typeof fakeTurnstile>;
let shown: boolean[];
const verifier = () => createVerifier(document.createElement("div"), "1x00000000000000000000BB", "ar", (v) => shown.push(v));

beforeEach(() => {
  ts = fakeTurnstile();
  shown = [];
  window.turnstile = ts;
});
afterEach(async () => {
  await tick(); // let deferred removals reach this test's fake, not the next one
  delete window.turnstile;
});

describe("Turnstile verifier", () => {
  it("renders once, interaction-only, with manual refresh (no background re-challenges)", async () => {
    const v = verifier();
    v.prepare();
    v.prepare();
    await tick();
    expect(ts.renders).toHaveLength(1);
    expect(ts.renders[0]).toMatchObject({ action: "chat", appearance: "interaction-only", "refresh-expired": "manual", language: "ar-eg" });
  });

  it("follows the page's theme (<html data-theme>), not the OS one; without one, Turnstile's auto", async () => {
    const de = document.documentElement;
    for (const theme of ["dark", "light", ""]) {
      if (theme) de.dataset.theme = theme;
      else delete de.dataset.theme;
      verifier().prepare();
      await tick();
      expect(ts.renders.at(-1)?.theme).toBe(theme || "auto");
      await tick();
    }
  });

  it("uses the compact widget (150 px) when its slot is narrower than the normal one (300 px + padding)", async () => {
    const sized = (w: number) => {
      const el = document.createElement("div");
      Object.defineProperty(el, "clientWidth", { value: w });
      return createVerifier(el, "1x00000000000000000000BB", "en", () => {});
    };
    sized(296).prepare();
    await tick();
    sized(376).prepare();
    await tick();
    expect(ts.renders.map((o) => o.size)).toEqual(["compact", "normal"]);
  });

  it("hands a token to a waiting request, then removes the widget", async () => {
    const v = verifier();
    const pending = v.token(new AbortController().signal);
    await tick();
    ts.solve("tok-1");
    await expect(pending).resolves.toBe("tok-1");
    await tick();
    expect(ts.removed).toEqual(["w1"]);
    expect(ts.live()).toEqual([]);
    expect(shown.at(-1)).toBe(false);
  });

  it("a token solved ahead of time is handed out at once; the next one comes from a fresh widget", async () => {
    const v = verifier();
    v.prepare();
    await tick();
    ts.solve("early");
    await expect(v.token(new AbortController().signal)).resolves.toBe("early");
    await tick();
    expect(ts.live()).toEqual([]);

    const next = v.token(new AbortController().signal); // e.g. after a 401 mid-conversation
    await tick();
    expect(ts.renders).toHaveLength(2);
    ts.solve("fresh");
    await expect(next).resolves.toBe("fresh");
  });

  it("an unused token that expires removes the widget instead of showing a refresh prompt", async () => {
    const v = verifier();
    v.prepare();
    await tick();
    ts.solve("stale");
    ts.expire();
    await tick();
    expect(ts.live()).toEqual([]);
    const pending = v.token(new AbortController().signal);
    await tick();
    expect(ts.renders).toHaveLength(2);
    ts.solve("new");
    await expect(pending).resolves.toBe("new");
  });

  it("drop() (a session started) removes the widget, forgets an unused token and hides the prompt", async () => {
    const v = verifier();
    v.prepare();
    await tick();
    ts.solve("unused");
    v.drop();
    await tick();
    expect(ts.removed).toEqual(["w1"]);
    expect(shown.at(-1)).toBe(false);
    const pending = v.token(new AbortController().signal);
    await tick();
    expect(ts.renders).toHaveLength(2); // not the dropped token
    ts.solve("after");
    await expect(pending).resolves.toBe("after");
  });

  it("rejects on a Turnstile error and on abort", async () => {
    const v = verifier();
    const failing = v.token(new AbortController().signal);
    await tick();
    ts.fail();
    await expect(failing).rejects.toThrow();
    const ctrl = new AbortController();
    const aborted = v.token(ctrl.signal);
    ctrl.abort();
    await expect(aborted).rejects.toThrow();
  });
});
