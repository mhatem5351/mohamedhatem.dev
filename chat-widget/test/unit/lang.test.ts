import { describe, expect, it } from "vitest";
import { detectLang, LATIN_RUN } from "../../src/lang";

describe("detectLang", () => {
  it("detects Arabic, including questions full of Latin tech terms", () => {
    expect(detectLang("ما هي خبرته؟", "en")).toBe("ar");
    expect(detectLang("ما خبرته في LangGraph و vLLM و RAG؟", "en")).toBe("ar");
  });
  it("keeps English questions that mention an Arabic name in English", () => {
    expect(detectLang("What does حاتم do at Globant?", "ar")).toBe("en");
  });
  it("falls back to the page language without letters", () => {
    expect(detectLang("👍 2026?", "ar")).toBe("ar");
    expect(detectLang("", "en")).toBe("en");
  });
});

describe("LATIN_RUN", () => {
  const runs = (s: string) => Array.from(s.matchAll(LATIN_RUN), (m) => m[0]);
  it("isolates tech terms, emails and phone numbers inside Arabic text", () => {
    expect(runs("يستخدم LangGraph و vLLM على A100 GPUs، راسله على hatem@mohamedhatem.dev أو +20 114 207 0946.")).toEqual([
      "LangGraph",
      "vLLM",
      "A100 GPUs",
      "hatem@mohamedhatem.dev",
      "+20 114 207 0946",
    ]);
  });
  it("leaves parentheses and trailing punctuation outside the run", () => {
    expect(runs("(LangGraph).")).toEqual(["LangGraph"]);
  });
});
