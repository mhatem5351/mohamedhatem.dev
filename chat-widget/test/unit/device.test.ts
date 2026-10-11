import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatRequest } from "../../../worker/src/chat/protocol";
import { createPanel } from "../../src/panel";
import { PANEL_CSS } from "../../src/panel-css";

/**
 * The panel's media query list, stubbed: happy-dom evaluates a comma-separated query list ("a, b") as if both had to
 * match, so the real one can't stand in for the sheet's "narrow or short window" condition.
 */
function stubMedia(matches: boolean) {
  const lists: { media: string; matches: boolean }[] = [];
  vi.stubGlobal("matchMedia", (media: string) => {
    const list = { media, matches, addEventListener() {}, removeEventListener() {} };
    lists.push(list);
    return list;
  });
  return lists;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  document.documentElement.style.overflow = "";
});

/** Opens a panel, asks a question and returns the JSON body of the /api/chat request. */
async function requestBody(): Promise<ChatRequest & Record<string, unknown>> {
  const fetch = vi.fn(
    async (_url: string, _init: RequestInit) => new Response("event: done\ndata: {}\n\n", { headers: { "Content-Type": "text/event-stream" } }),
  );
  vi.stubGlobal("fetch", fetch);
  const host = document.body.appendChild(document.createElement("div"));
  const root = host.attachShadow({ mode: "open" });
  const bubble = root.appendChild(document.createElement("button"));
  const panel = createPanel({ host, root, bubble, config: {}, lang: "en", key: `t${Math.random()}`, addStyles: () => {} });
  panel.open({ question: "What has he built?" });
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  panel.close();
  return JSON.parse(fetch.mock.calls[0]![1].body as string);
}

describe('request body: device: "phone" in the phone sheet (the Worker then asks for shorter answers)', () => {
  it("the condition is the sheet's own media query, the one panel-css.ts lays the sheet out with", async () => {
    const lists = stubMedia(true);
    await requestBody();
    expect(lists).toHaveLength(1);
    expect(PANEL_CSS).toContain(`@media ${lists[0]!.media}{.pn{`);
  });

  it('sends device: "phone" while the sheet layout is active', async () => {
    stubMedia(true);
    const body = await requestBody();
    expect(body.device).toBe("phone");
    expect(body.messages).toEqual([{ role: "user", content: "What has he built?" }]);
  });

  it("leaves the field out with the desktop panel", async () => {
    stubMedia(false);
    const body = await requestBody();
    expect("device" in body).toBe(false);
    expect(body).toEqual({ messages: [{ role: "user", content: "What has he built?" }], lang: "en" });
  });

  it("follows the layout at the time of each request (a rotated phone, a resized window)", async () => {
    const lists = stubMedia(false);
    const fetch = vi.fn(async () => new Response("event: done\ndata: {}\n\n", { headers: { "Content-Type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetch);
    const host = document.body.appendChild(document.createElement("div"));
    const root = host.attachShadow({ mode: "open" });
    const bubble = root.appendChild(document.createElement("button"));
    const panel = createPanel({ host, root, bubble, config: {}, lang: "en", key: `t${Math.random()}`, addStyles: () => {} });
    const bodies = () => fetch.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string) as ChatRequest);
    panel.open({ question: "First?" });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(root.querySelector(".go.stop")?.hasAttribute("hidden")).toBe(true));
    lists[0]!.matches = true;
    panel.open({ question: "Second?" });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(bodies().map((b) => b.device)).toEqual([undefined, "phone"]);
  });
});
