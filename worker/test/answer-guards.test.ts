/// <reference types="node" />
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { fitContents, streamAnswer, type AnswerDeps } from "../src/chat/answer";
import { CONFIDENTIAL_FOLLOWUPS, CONFIDENTIAL_REPLY, ConfidentialMatcher } from "../src/chat/confidential";
import { resetCooldowns } from "../src/chat/cooldown";
import { estimateTokens, inputTokenLimit, isFast, profileFor } from "../src/chat/gemini";
import { answerableFollowup, asksAboutFit, isJobDescription, keepsClientsApart, wantsContact } from "../src/chat/intent";
import { buildPhoneFormats, PhoneFilter } from "../src/chat/links";
import { asksAboutClients, asksAboutGovAssistant } from "../src/chat/intent";
import { CLIENTS_HINT, CONFIDENTIAL_HINT, GOV_ASSISTANT_HINT, JD_RULES, systemInstruction } from "../src/chat/prompt";
import { finalChunk, geminiSse, memorySink, textChunk } from "./helpers";

/* Dummy names only: the real ones never appear in the repository (see confidential.test.ts). */
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const DUMMY = new ConfidentialMatcher([sha("zebracorp"), sha("ministry of zebras")]);

const contents = [{ role: "user" as const, parts: [{ text: "<visitor_message>\nhi\n</visitor_message>" }] }];
const modelOf = (url: string) => /models\/([^:]+):/.exec(url)![1]!;
const deps = (fetcher: (url: string, init: RequestInit) => Promise<Response>, extra: Partial<AnswerDeps> = {}): AnswerDeps => ({
  apiKey: "k",
  primary: "primary",
  fallbacks: [],
  hedgeMs: 200,
  fetcher: fetcher as unknown as typeof fetch,
  timeouts: { first: 2000, idle: 500, total: 5000, ping: 50 },
  confidential: DUMMY,
  ...extra,
});
const run = (fetcher: Parameters<typeof deps>[0], extra: Partial<AnswerDeps> = {}) => {
  const sink = memorySink();
  return streamAnswer("SYS", contents, deps(fetcher, extra), sink, new AbortController().signal).then((r) => ({ r, sink }));
};

beforeEach(() => resetCooldowns());

describe("confidential client (AST-01): the answer is replaced, never shown", () => {
  it("a name the model echoes from the visitor is replaced by the fixed reply before any of it is sent", async () => {
    const fetcher = async () =>
      geminiSse([textChunk("Hatem built a bilingual assistant for "), textChunk("the Ministry of "), textChunk("Zebras. It used RAG."), finalChunk()]);
    const { r, sink } = await run(fetcher, { lang: "en" });
    expect(r.outcome).toBe("redacted");
    const wire = JSON.stringify(sink.events).toLowerCase();
    expect(wire).not.toContain("zebras");
    expect(wire).not.toContain("ministry of");
    // Some text had already been shown, so the widget is told to replace it.
    const replace = sink.events.find((e) => e.event === "replace");
    expect(replace?.data.t).toBe(CONFIDENTIAL_REPLY.en);
    expect(sink.names().slice(-2)).toEqual(["tool", "done"]);
    expect(sink.events.at(-2)!.data).toEqual({ name: "suggest_followups", args: { questions: CONFIDENTIAL_FOLLOWUPS.en } });
    expect(sink.names()).not.toContain("error");
  });

  it("when nothing was shown yet, the fixed reply simply streams as the answer (old widgets show it too)", async () => {
    const fetcher = async () => geminiSse([textChunk("ZebraCorp asked for it."), finalChunk()]);
    const { r, sink } = await run(fetcher, { lang: "ar" });
    expect(r.outcome).toBe("redacted");
    expect(sink.names()).not.toContain("replace");
    expect(sink.text()).toBe(CONFIDENTIAL_REPLY.ar);
  });

  it("a name split across chunks in the directive-free tail is still caught at the end of the answer", async () => {
    const fetcher = async () => geminiSse([textChunk("The client was zebra"), textChunk("corp"), finalChunk()]);
    const { r, sink } = await run(fetcher);
    expect(r.outcome).toBe("redacted");
    expect(JSON.stringify(sink.events).toLowerCase()).not.toContain("zebra");
  });

  it("follow-up chips naming the client are dropped; the answer itself stays", async () => {
    const fetcher = async () =>
      geminiSse([textChunk('He leads AI engineering at Globant.<ui>{"followups":["Was it for ZebraCorp?","What did he build at Wakeb Data?"]}</ui>'), finalChunk()]);
    const { r, sink } = await run(fetcher);
    expect(r.outcome).toBe("ok");
    const chips = sink.events.find((e) => e.event === "tool")!.data.args.questions;
    expect(chips).toEqual(["What did he build at Wakeb Data?"]);
  });

  it("the visitor naming the client adds a per-turn instruction after the cacheable prefix", () => {
    const base = { reply: "en" as const, pageLang: "en" as const, now: new Date("2026-10-10T00:00:00Z") };
    const plain = systemInstruction(base);
    const named = systemInstruction({ ...base, namesClient: true });
    expect(plain).not.toContain(CONFIDENTIAL_HINT);
    expect(named).toContain(CONFIDENTIAL_HINT);
    // The stable prefix (everything before "# This conversation") is byte-identical, so Gemini's cache still applies.
    expect(named.split("# This conversation")[0]).toBe(plain.split("# This conversation")[0]);
  });
});

describe("GADD and the government assistant: per-turn hints (R6-01, R6-02)", () => {
  const base = { reply: "en" as const, pageLang: "en" as const, now: new Date("2026-10-11T00:00:00Z") };
  it("a clients question gets the GADD sentence and the rule to leave the government assistant out", () => {
    for (const q of ["Which clients did he work for at Wakeb Data?", "من هم عملاء حاتم في Wakeb Data؟", "Was GADD his client?"]) expect(asksAboutClients(q), q).toBe(true);
    const text = systemInstruction({ ...base, clients: true });
    expect(text).toContain(CLIENTS_HINT);
    expect(text).not.toContain(GOV_ASSISTANT_HINT);
    expect(text.split("# This conversation")[0]).toBe(systemInstruction(base).split("# This conversation")[0]);
  });
  it("a question about the government assistant never gets the GADD sentence, even when it also says 'client'", () => {
    for (const q of [
      "The Saudi government client of the bilingual assistant: is it the same organisation as the Saudi client listed on his Wakeb role?",
      "Was the bilingual government assistant he built at Wakeb made for the Ministry of Defense?",
      "Which government body was the Saudi bilingual assistant built for?",
      "ما اسم الجهة الحكومية السعودية التي بنى لها حاتم المساعد ثنائي اللغة؟",
    ])
      expect(asksAboutGovAssistant(q), q).toBe(true);
    const text = systemInstruction({ ...base, clients: true, govAssistant: true });
    expect(text).toContain(GOV_ASSISTANT_HINT);
    expect(text).not.toContain(CLIENTS_HINT);
    const named = systemInstruction({ ...base, clients: true, namesClient: true });
    expect(named).toContain(CONFIDENTIAL_HINT);
    expect(named).not.toContain(CLIENTS_HINT);
    expect(asksAboutGovAssistant("What did he build at Wakeb Data?")).toBe(false);
  });
});

describe("contact card and follow-ups (AST-10)", () => {
  const withCard = '<ui>{"contact":"general","section":"work","followups":["What is his notice period?","What skills are listed without projects?","What did he build with LangGraph?"]}</ui>';

  it("the contact card is dropped unless the visitor asked to reach or hire him", async () => {
    const fetcher = async () => geminiSse([textChunk(`AIP's figures aren't public.${withCard}`), finalChunk()]);
    const off = await run(fetcher, { contactAllowed: false });
    expect(off.sink.events.filter((e) => e.event === "tool").map((e) => e.data.name)).toEqual(["open_section", "suggest_followups"]);
    const on = await run(fetcher, { contactAllowed: true });
    expect(on.sink.events.filter((e) => e.event === "tool").map((e) => e.data.name)).toEqual(["show_contact_card", "open_section", "suggest_followups"]);
  });

  it("chips that lead to 'not stated' or describe the knowledge base are dropped", async () => {
    const fetcher = async () => geminiSse([textChunk(`Two systems.${withCard}`), finalChunk()]);
    const { sink } = await run(fetcher);
    expect(sink.events.find((e) => e.data?.name === "suggest_followups")!.data.args.questions).toEqual(["What did he build with LangGraph?"]);
  });

  it("intent rules", () => {
    for (const q of ["How can I contact him?", "We'd like to hire Hatem", "What's his WhatsApp?", "Can I see his CV?", "Is he open to relocation to Dubai?", "Is he a fit for a Senior LLM Engineer role?", "رقمه كام؟", "عايز أكلمه", "هل يناسب هذه الوظيفة؟"])
      expect(wantsContact(q), q).toBe(true);
    for (const q of ["What has he built with LangGraph?", "By what percentage did AIP v2 improve accuracy?", "Who is the Saudi government client?", "How old is he?", "ما خبرته في RAG؟"])
      expect(wantsContact(q), q).toBe(false);
    for (const q of ["What is his notice period?", "How many reports does he have?", "What skills are listed without projects?", "What does STA stand for?", "ما هو راتبه المتوقع؟"])
      expect(answerableFollowup(q), q).toBe(false);
    // The team of 7 at Globant is stated (round 6).
    for (const q of ["What did he build at Wakeb Data?", "How does he serve LLMs?", "ما خبرته في vLLM؟", "How big is his team?"]) expect(answerableFollowup(q), q).toBe(true);
  });

  it("contact card: availability of a person, not of a product; no bare 'fit' or Arabic 'number' (R6-13)", () => {
    for (const q of ["Is he available for a new role?", "Would he move to Dubai?", "Can I DM him?", "Does he take freelance work?", "هل يقبل العمل الحر؟", "ما رقم الواتساب؟", "هل حاتم متاح للعمل؟", "Would Hatem suit an AI team lead role at our startup?", "هل يصلح حاتم لدور مهندس MLOps؟"])
      expect(wantsContact(q), q).toBe(true);
    for (const q of ["Did the model fit on one GPU?", "هل الخدمة متاحة الآن؟", "ما رقم الإصدار؟", "ما الأرقام الرئيسية في مشروع الهيئة السعودية للسياحة؟ وهل «نورة» متاحة للجمهور الآن؟", "Is Noura available to the public?"])
      expect(wantsContact(q), q).toBe(false);
  });

  it("fit questions in other words get the job-description rules (R6-13)", () => {
    for (const q of ["Would Hatem suit an AI team lead role at our startup?", "Does he match our MLOps opening?", "Would he be a good hire?", "Is he the right candidate for this?", "هل يصلح حاتم لدور مهندس MLOps في الرياض؟", "هل هو مناسب لهذا الدور؟"])
      expect(asksAboutFit(q), q).toBe(true);
    for (const q of ["What suits a small team better, RAG or fine-tuning?", "Did the model fit on one GPU?"]) expect(asksAboutFit(q), q).toBe(false);
  });

  it("chips never ask what the STA project or the government assistant run on, or who its client is (R6-14)", () => {
    for (const q of ["What models power Noura?", "Which LLMs does Noura use?", "What models did he use for the assistant?", "What technologies did he use for the assistant?", "Which cloud hosts the STA project?", "Is Noura live yet?", "When will Noura launch?", "Which ministry was the assistant for?", "What are the client's initials?", "ما التقنيات المستخدمة في المشروع؟", "ما النموذج المستخدم في نورة؟", "متى سيطلق المساعد؟"])
      expect(answerableFollowup(q), q).toBe(false);
    for (const q of ["What tech stack did the STA project use?", "What models did he serve at Wakeb Data?", "What tools does the ArabsStock Assistant use?", "How many tools does Noura have?", "What did he build for the Saudi Tourism Authority?"])
      expect(answerableFollowup(q), q).toBe(true);
  });

  it("GADD and the government assistant never meet in an answer and its chips (R6-01, R6-02)", async () => {
    expect(keepsClientsApart("The Saudi Ministry of Defense (GADD) is a client of his Wakeb Data role.", "What did he build for the Saudi government client?")).toBe(false);
    expect(keepsClientsApart("He built a bilingual enterprise assistant for a Saudi government client.", "Was GADD a client?")).toBe(false);
    expect(keepsClientsApart("وزارة الدفاع السعودية (GADD) عميل لدوره في Wakeb Data.", "ماذا بنى للجهة الحكومية؟")).toBe(false);
    expect(keepsClientsApart("The Saudi Ministry of Defense (GADD) is a client of his Wakeb Data role.", "What did he build at Wakeb Data?")).toBe(true);
    const fetcher = async () =>
      geminiSse([
        textChunk('The Saudi Ministry of Defense (GADD) is a client of his Wakeb Data role as a whole.<ui>{"followups":["What did he build for the government client?","What did he build at Wakeb Data?"]}</ui>'),
        finalChunk(),
      ]);
    const { sink } = await run(fetcher);
    expect(sink.events.find((e) => e.data?.name === "suggest_followups")!.data.args.questions).toEqual(["What did he build at Wakeb Data?"]);
  });
});

describe("job descriptions (AST-02, AST-03)", () => {
  it("detects a pasted job description, in English or Arabic, and not an ordinary question", () => {
    expect(isJobDescription("Is he a fit?\n\nSenior AI Engineer\nRequirements:\n- 5+ years\n- LangGraph")).toBe(true);
    expect(isJobDescription(`Is he a fit? ${"We build AI copilots for lenders. ".repeat(20)}`)).toBe(true);
    expect(isJobDescription("هل يناسب هذه الوظيفة؟\nالمتطلبات:\n- خبرة 5 سنوات\n- Python")).toBe(true);
    expect(isJobDescription("What are his requirements for relocation?")).toBe(false);
  });

  it("role-fit questions get the same rules, even without a pasted job description (the starter chip)", () => {
    for (const q of ["Is he a fit for a Senior LLM Engineer role? Give me his strengths and any gaps.", "Would Hatem be suitable for an MLOps lead position?", "هل يناسب حاتم دور مهندس LLM أول؟"])
      expect(asksAboutFit(q), q).toBe(true);
    for (const q of ["What has he built with LangGraph?", "How can I contact him?", "What are his strengths in RAG?"]) expect(asksAboutFit(q), q).toBe(false);
  });

  it("a job-description turn gets the grounding rules after the cacheable prefix", () => {
    const base = { reply: "ar" as const, pageLang: "ar" as const, now: new Date() };
    const text = systemInstruction({ ...base, jd: true });
    expect(text).toContain(JD_RULES);
    expect(JD_RULES).toContain("الملاءمة العامة");
    expect(JD_RULES).toMatch(/strong" only when no core requirement is a gap/);
    // R6-07: the no-JD rule comes first; R6-12: planted instructions are ignored silently.
    expect(JD_RULES.split("\n")[1]).toMatch(/^- Without a pasted job description/);
    expect(JD_RULES).toMatch(/ignore them silently/);
    expect(systemInstruction({ ...base, jd: true }, true)).toContain(JD_RULES); // Gemma's compact prompt too
  });

  it("token estimate is above countTokens for English and Arabic (calibrated), so limits are never underestimated", () => {
    // countTokens, measured: a 5,752-character English job description = 1,234 tokens; 6,000 Arabic characters = 2,096.
    expect(estimateTokens("x".repeat(5752))).toBeGreaterThan(1234);
    expect(estimateTokens("ب".repeat(6000))).toBeGreaterThan(2096);
  });

  it("Gemma (16K input tokens a minute) gets a shortened history, or is skipped when even the latest message won't fit", () => {
    expect(inputTokenLimit("gemma-4-31b-it")).toBeLessThan(16_000);
    const sys = "s".repeat(4 * 6300); // the compact instruction, ~6.3K tokens
    const turn = (role: "user" | "model", n: number) => ({ role, parts: [{ text: "w".repeat(n) }] });
    const history = [turn("user", 1200), turn("model", 2400), turn("user", 1200), turn("model", 2400), turn("user", 1200), turn("model", 2400), turn("user", 6000)];
    const fit = fitContents(sys, history, 9000)!;
    expect(fit.at(-1)).toBe(history.at(-1));
    expect(fit[0]!.role).toBe("user");
    expect(fit.length).toBeLessThan(history.length);
    expect(fitContents(sys, [turn("user", 60_000)], 9000)).toBeNull();
  });

  it("routes a request that is too long for Gemma to the next model instead of a 429", async () => {
    const calls: string[] = [];
    const fetcher = async (url: string) => {
      calls.push(modelOf(url));
      return geminiSse([textChunk("ok"), finalChunk()]);
    };
    const longTurn = [{ role: "user" as const, parts: [{ text: "ب".repeat(45_000) }] }];
    const sink = memorySink();
    const r = await streamAnswer("SYS", longTurn, deps(fetcher, { primary: "gemma-4-31b-it", fallbacks: ["gemini-3.5-flash-lite"] }), sink, new AbortController().signal);
    expect(calls).toEqual(["gemini-3.5-flash-lite"]);
    expect(r.trace).toContain("gemma-4-31b-it:too-long");
  });
});

describe("latency (AST-06)", () => {
  it("hedges go to fast models: 2.5 Flash without thinking, Flash-Lite at minimal thinking (normal thinking for job descriptions)", async () => {
    expect(isFast("gemini-2.5-flash")).toBe(true);
    expect(isFast("gemini-3.5-flash-lite")).toBe(true);
    expect(isFast("gemini-3.8-flash")).toBe(false);
    expect(profileFor("gemini-3.5-flash-lite", { fast: true }).thinkingConfig).toEqual({ thinkingLevel: "minimal" });

    const bodies: Record<string, any> = {};
    const fetcher = async (url: string, init: RequestInit) => {
      bodies[modelOf(url)] = JSON.parse(String(init.body));
      if (modelOf(url) === "gemini-3.8-flash") return geminiSse([textChunk("slow")], { firstDelayMs: 1500 });
      return geminiSse([textChunk("fast"), finalChunk()]);
    };
    const chain = { primary: "gemini-3.8-flash", fallbacks: ["gemini-3.7-flash", "gemini-3.5-flash-lite"] };
    const quick = await run(fetcher, chain);
    expect(quick.r.model).toBe("gemini-3.5-flash-lite");
    expect(bodies["gemini-3.5-flash-lite"].generationConfig.thinkingConfig).toEqual({ thinkingLevel: "minimal" });
    expect(bodies["gemini-3.8-flash"].generationConfig.thinkingConfig).toEqual({ thinkingLevel: "low" });

    resetCooldowns();
    await run(fetcher, { ...chain, jd: true });
    expect(bodies["gemini-3.5-flash-lite"].generationConfig.thinkingConfig).toEqual({ thinkingLevel: "low" });
  });
});

describe("phone number (AST-08)", () => {
  const formats = buildPhoneFormats(["WhatsApp **+20 114 207 0946**, [wa.me/201142070946](https://wa.me/201142070946)"]);
  const through = (pieces: string[]) => {
    const f = new PhoneFilter(formats);
    return pieces.map((p) => f.push(p)).join("") + f.flush();
  };

  it("rewrites the model's reversed or ungrouped spellings to +20 114 207 0946, at any chunk boundary", () => {
    const text = "- **واتساب:** [201142070946+](https://wa.me/201142070946) أو 01142070946 أو +201142070946.";
    const want = "- **واتساب:** [+20 114 207 0946](https://wa.me/201142070946) أو +20 114 207 0946 أو +20 114 207 0946.";
    for (let size = 1; size <= text.length; size += 3) {
      const pieces: string[] = [];
      for (let i = 0; i < text.length; i += size) pieces.push(text.slice(i, i + size));
      expect(through(pieces)).toBe(want);
    }
  });

  it("leaves URLs, link targets, other numbers and years alone", () => {
    const text = "See wa.me/201142070946 or https://wa.me/201142070946?text=hi; 3,008+ developers; 2023 - 2027; +20 114 207 0946.";
    expect(through([text])).toBe(text);
    expect(through(["٢٠١١٤٢٠٧٠٩٤٦+"])).toBe("+20 114 207 0946");
  });
});
