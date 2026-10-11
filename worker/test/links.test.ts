import { describe, expect, it } from "vitest";
import { streamAnswer } from "../src/chat/answer";
import { resetCooldowns } from "../src/chat/cooldown";
import { profileFor } from "../src/chat/gemini";
import { buildLinkCheck, LinkFilter } from "../src/chat/links";
import { CONTENT_SOURCE, KNOWLEDGE, SITE_PATHS, SYSTEM_PROMPT } from "../src/generated/content";
import { finalChunk, geminiSse, memorySink, textChunk } from "./helpers";

const KB = `Contact: [hatem@mohamedhatem.dev](mailto:hatem@mohamedhatem.dev), WhatsApp https://wa.me/201142070946.
LinkedIn https://www.linkedin.com/in/mohamed-hatem-6a5790173 · repo https://github.com/mhatem5351/staged-llm-evaluator.`;
const check = buildLinkCheck([KB]);

const run = (pieces: string[]) => {
  const f = new LinkFilter(check);
  return pieces.map((p) => f.push(p)).join("") + f.flush();
};

describe("link allow-list", () => {
  it("allows the knowledge base's URLs (and sub-paths), the site, in-site anchors, its mailto and tel numbers", () => {
    for (const ok of [
      "https://wa.me/201142070946",
      "https://wa.me/201142070946?text=Hi",
      "https://www.linkedin.com/in/mohamed-hatem-6a5790173/",
      "https://github.com/mhatem5351/staged-llm-evaluator/blob/main/README.md",
      "https://mohamedhatem.dev/ar/#contact",
      "#experience",
      "/ar/#work",
      "mailto:hatem@mohamedhatem.dev",
      "mailto:Hatem@MohamedHatem.dev?subject=Hi",
      "tel:+201142070946",
    ]) {
      expect(check(ok), ok).toBe(true);
    }
  });

  it("refuses look-alikes, other paths, other origins and other schemes", () => {
    for (const bad of [
      "https://wa.co/201142070946",
      "https://wa.me/201000000000",
      "https://github.com/someone-else",
      "https://github.com/mhatem5351/staged-llm-evaluator-fake",
      "https://mohamedhatem.dev.evil.example/",
      "http://evil.example/?u=https://wa.me/201142070946",
      "mailto:hatem.hiring@gmail-careers.com",
      "javascript:alert(1)",
      "//evil.example",
      "tel:+15555550123",
    ]) {
      expect(check(bad), bad).toBe(false);
    }
  });

  it("refuses the backslash, tab and newline tricks that browsers turn into another origin (SEC-4)", () => {
    for (const bad of ["/\\evil.example/login", "/\t/evil.example/login", "/\n/evil.example", "\\\\evil.example", "https://mohamedhatem.dev\\@evil.example/", "/ /evil.example", "/\u2028/evil.example"]) {
      expect(check(bad), JSON.stringify(bad)).toBe(false);
    }
    // Why: the WHATWG URL parser reads "\\" as "/" and drops tabs, so these leave the site.
    expect(new URL("/\\evil.example/login", "https://mohamedhatem.dev/").origin).toBe("https://evil.example");
    expect(new URL("/\t/evil.example/login", "https://mohamedhatem.dev/").origin).toBe("https://evil.example");
    // relative links that stay on the site are fine
    for (const ok of ["/cv/", "/ar/#contact", "cv/", "#work"]) expect(check(ok), ok).toBe(true);
  });

  it("on the site, only real pages: written in the sources, the fixed pages or the page list; never a guessed slug (R6-10)", () => {
    const site = buildLinkCheck([`${KB} Case study: https://mohamedhatem.dev/work/sta-tourism-assistants/`], undefined, ["/work/arabsstock-assistant/", "/ar/work/arabsstock-assistant/"]);
    for (const ok of [
      "https://mohamedhatem.dev/",
      "https://mohamedhatem.dev/#work",
      "https://mohamedhatem.dev/ar/#contact",
      "https://mohamedhatem.dev/cv/",
      "https://mohamedhatem.dev/ar/cv",
      "https://mohamedhatem.dev/work/sta-tourism-assistants/",
      "https://mohamedhatem.dev/work/sta-tourism-assistants/#approach",
      "https://www.mohamedhatem.dev/work/arabsstock-assistant/",
      "/ar/work/arabsstock-assistant/",
      "/cv/",
      "#work",
    ])
      expect(site(ok), ok).toBe(true);
    for (const bad of [
      "https://mohamedhatem.dev/work/wakeb-chatbot/",
      "https://mohamedhatem.dev/work/",
      "https://mohamedhatem.dev/ar/work/sta-tourism-assistants-v2/",
      "https://mohamedhatem.dev/admin/",
      "/work/wakeb-chatbot/",
      "work/arabsstock/",
    ])
      expect(site(bad), bad).toBe(false);
  });

  it("the Worker's own list: every case-study page in both languages, and every site link in the chat content, is a real page", () => {
    if (CONTENT_SOURCE !== "content" || !SITE_PATHS) return; // fixture runs
    const real = buildLinkCheck([KNOWLEDGE, SYSTEM_PROMPT], undefined, SITE_PATHS);
    expect(SITE_PATHS.filter((p) => p.startsWith("/work/")).length).toBeGreaterThanOrEqual(8);
    for (const p of SITE_PATHS) expect(real(`https://mohamedhatem.dev${p}`), p).toBe(true);
    expect(real("https://mohamedhatem.dev/work/wakeb-chatbot/")).toBe(false);
    for (const m of KNOWLEDGE.matchAll(/https:\/\/mohamedhatem\.dev\/work\/([a-z0-9-]+)\//g)) expect(SITE_PATHS, m[1]).toContain(`/work/${m[1]}/`);
  });

  it("the streaming filter judges a markdown link even when its target contains whitespace", () => {
    expect(run(["See [apply here](/\t/evil.example/login) now."])).toBe("See apply here now.");
    expect(run(["See [apply ", "here](/\\evil.example/login) now."])).toBe("See apply here now.");
    expect(run(['A [titled](https://mohamedhatem.dev/cv/ "CV") link.'])).toBe('A [titled](https://mohamedhatem.dev/cv/ "CV") link.');
  });
});

describe("LinkFilter (streaming)", () => {
  const text = "Reach him on [WhatsApp](https://wa.co/201142070946) or [email](mailto:hatem@mohamedhatem.dev). Repo: https://github.com/mhatem5351/staged-llm-evaluator. Fake: https://evil.example/x now.";
  const expected = "Reach him on WhatsApp or [email](mailto:hatem@mohamedhatem.dev). Repo: https://github.com/mhatem5351/staged-llm-evaluator. Fake:  now.";

  it("keeps allowed links, unlinks bad markdown links and drops bad bare URLs, at any chunk size", () => {
    for (const size of [1, 2, 3, 7, 16, text.length]) {
      const pieces: string[] = [];
      for (let i = 0; i < text.length; i += size) pieces.push(text.slice(i, i + size));
      expect(run(pieces)).toBe(expected);
    }
  });

  it("passes ordinary text and brackets straight through", () => {
    const f = new LinkFilter(check);
    expect(f.push("Arrays like [1, 2] and a [note]\nnext line ")).toBe("Arrays like [1, 2] and a [note]\nnext line ");
    expect(f.push("with ma")).toBe("with ");
    expect(f.push("ny words.")).toBe("many words.");
    expect(f.flush()).toBe("");
  });

  it("an answer cut off inside a link keeps the link text only", () => {
    expect(run(["See [his work](https://mohamedhat"])).toBe("See his work");
    expect(run(["See [his work"])).toBe("See [his work");
  });
});

describe("thinking per model", () => {
  it("Gemini 3 Flash and Flash-Lite think at low, with room for the thinking tokens", () => {
    expect(profileFor("gemini-3.5-flash-lite")).toEqual({ thinkingConfig: { thinkingLevel: "low" }, thinkingHeadroom: 1800 });
    expect(profileFor("gemini-3.5-flash-lite", { fast: true })).toEqual({ thinkingConfig: { thinkingLevel: "minimal" }, thinkingHeadroom: 600 });
    expect(profileFor("gemini-3.1-flash-lite")).toEqual({ thinkingConfig: { thinkingLevel: "low" }, thinkingHeadroom: 1800 });
    expect(profileFor("gemini-3.8-flash")).toEqual({ thinkingConfig: { thinkingLevel: "low" }, thinkingHeadroom: 400 });
  });
});

describe("link guard inside streamAnswer", () => {
  it("a misremembered WhatsApp link never reaches the browser as a link", async () => {
    resetCooldowns();
    const sink = memorySink();
    const fetcher = async () => geminiSse([textChunk("His [WhatsApp](https://wa.co/2011"), textChunk("42070946) is the quickest."), finalChunk()]);
    await streamAnswer("SYS", [{ role: "user", parts: [{ text: "phone?" }] }], { apiKey: "k", primary: "m", fallbacks: [], hedgeMs: 1000, fetcher: fetcher as unknown as typeof fetch }, sink, new AbortController().signal);
    expect(sink.text()).toBe("His WhatsApp is the quickest.");
  });
});
