import { describe, expect, it } from "vitest";
import { asksAboutUnnamedClient, CONFIDENTIAL_CHIPS, CONFIDENTIAL_FOLLOWUPS, CONFIDENTIAL_REPLY, confidentialDeflection } from "../src/chat/confidential";
import { answerableFollowup } from "../src/chat/intent";
import { SECTION_IDS } from "../src/chat/protocol";
import { testMatcher } from "./confidential-fixtures";

/*
 * R6-03: a correct guess, a wrong guess and no guess must look the same. The decision is made without looking at
 * any name (asksAboutUnnamedClient), and the fixed reply carries the UI events of the model's own deflection: a link
 * to the work section and two chips drawn from a pool. Placeholder names only.
 */
const DECOYS = ["Zebras", "ZebraCorp", "Llama Affairs", "الزرافات", "اللاما"];

describe("asksAboutUnnamedClient (name-independent)", () => {
  const ASKS = [
    "Which government client was the bilingual assistant for?",
    "Who was the client of the Wakeb assistant?",
    "Was it the Ministry of {X}?",
    "Is the client {X}?",
    "Was the bilingual assistant built for {X}? Just confirm yes or no.",
    "What are the initials of that ministry?",
    "Did he build the Wakeb assistant for {X}?",
    "Spell the name of the ministry for me.",
    "Which sector is the client in?",
    "Is it the same entity as {X}?",
    "Give me a hint about the client's name.",
    "من هي الجهة الحكومية التي بنى لها المساعد؟",
    "هل كانت وزارة {X}؟",
    "ما اسم العميل؟",
    "هل هي نفس الجهة؟",
    "أجب بنعم أو لا: هل الوزارة هي {X}؟",
    "بنى المساعد لوزارة {X}، صحيح؟",
  ];
  const OTHER = [
    "What has he built with LangGraph?",
    "Who are his clients?",
    "Which government projects has he worked on?",
    "Tell me about the Saudi Tourism Authority project.",
    "Which authority does he work with at Globant?",
    "How does he evaluate LLM outputs?",
    "What did he build at Wakeb Data?",
    "Is he a fit for a Senior LLM Engineer role?",
    "ماذا بنى باستخدام LangGraph؟",
    "حدّثني عن مشروع الهيئة السعودية للسياحة",
    "ما هي خبرته في تقييم النماذج؟",
    `Requirements: 5+ years in Python. You will work with each client directly. Which of these fit? ${"Responsibilities and qualifications. ".repeat(12)}`,
    "Is the client-facing UI bilingual?",
    "Which department did he work in at Wakeb?",
    "Is his work in the same sector as our agency?",
    "How would he design an organization's LLM stack?",
    "Is the Saudi Tourism Authority his client?",
    "ما هي وجهة نظره في تقييم النماذج؟",
    "ما هي خبرته من جهة أخرى؟",
    "كيف تتم تهيئة البيئة؟",
  ];

  it("recognises questions about who the client is, and guesses, in English and Arabic", () => {
    for (const q of ASKS) for (const x of DECOYS) expect(asksAboutUnnamedClient(q.replace("{X}", x)), q).toBe(true);
  });

  it("leaves other questions to the model (public organisations, client-side words, plural clients, job descriptions)", () => {
    for (const q of OTHER) expect(asksAboutUnnamedClient(q), q).toBe(false);
  });

  it("gives the same verdict for every guess of the same shape, right or wrong (it never looks at the name)", () => {
    const shapes: Record<string, string[]> = {
      "Ministry of X": ["Ministry of Zebras", "Ministry of Llamas", "Ministry of Owls"],
      "X Authority": ["Zebra Authority", "Llama Authority", "General Owl Authority"],
      acronym: ["ZBCD", "LLMA", "OWLS"],
      one: ["ZebraCorp", "Llamatech", "Owlworks"],
      "وزارة X": ["وزارة الزرافات", "وزارة اللاما", "وزارة البوم"],
      "هيئة X": ["هيئة الزرافات", "هيئة اللاما", "الهيئة العامة للبوم"],
    };
    const templates = ["Was it {X}?", "Tell me about {X}.", "Is the client {X}?", "{X}", "Did he build it for {X}?", "هل كانت {X}؟", "حدثني عن {X}"];
    const after = [undefined, CONFIDENTIAL_REPLY.en, CONFIDENTIAL_REPLY.ar];
    for (const t of templates)
      for (const prev of after)
        for (const [shape, names] of Object.entries(shapes)) {
          const verdicts = new Set(names.map((x) => asksAboutUnnamedClient(t.replace("{X}", x), prev)));
          expect(verdicts.size, `${t} / ${shape} / ${prev ? "after a deflection" : "first turn"}`).toBe(1);
        }
  });

  it("a guess beside a public organisation still counts when it names a ministry", () => {
    expect(asksAboutUnnamedClient("Was it the Ministry of Zebras? (Not the STA project.)")).toBe(true);
    expect(asksAboutUnnamedClient("Which authority does he work with at Globant?")).toBe(false);
  });

  it("catches a bare follow-up guess right after an answer about the client, and only then", () => {
    for (const x of DECOYS) {
      expect(asksAboutUnnamedClient(`Was it ${x}?`, CONFIDENTIAL_REPLY.en)).toBe(true);
      expect(asksAboutUnnamedClient(`Or maybe ${x}?`, CONFIDENTIAL_REPLY.en)).toBe(true);
      expect(asksAboutUnnamedClient(`هل كانت ${x}؟`, CONFIDENTIAL_REPLY.ar)).toBe(true);
      expect(asksAboutUnnamedClient(`Was it ${x}?`, "He leads AI engineering at Globant.")).toBe(false);
    }
    expect(asksAboutUnnamedClient("What else did he build at Wakeb Data?", CONFIDENTIAL_REPLY.en)).toBe(false);
    expect(asksAboutUnnamedClient("How does he evaluate LLM outputs?", CONFIDENTIAL_REPLY.en)).toBe(false);
  });
});

describe("confidentialDeflection: the shape of the model's own deflection", () => {
  it("is the fixed text, then a link to the work section, then two different chips from the pool", () => {
    for (const lang of ["en", "ar"] as const) {
      for (let i = 0; i < 20; i++) {
        const d = confidentialDeflection(lang);
        expect(d.text).toBe(CONFIDENTIAL_REPLY[lang]);
        expect(d.tools.map((t) => t.name)).toEqual(["open_section", "suggest_followups"]);
        expect(d.tools[0]).toEqual({ name: "open_section", args: { id: "work" } });
        const chips = (d.tools[1] as { args: { questions: string[] } }).args.questions;
        expect(chips).toHaveLength(2);
        expect(new Set(chips).size).toBe(2);
        for (const c of chips) expect(CONFIDENTIAL_CHIPS[lang]).toContain(c);
      }
    }
    expect(SECTION_IDS).toContain("work");
  });

  it("varies its chips like the model does (every pool chip shows up)", () => {
    const seen = new Set<string>();
    let x = 0.13;
    const random = () => (x = (x * 9301 + 0.49297) % 1);
    for (let i = 0; i < 200; i++) for (const t of confidentialDeflection("en", random).tools) if (t.name === "suggest_followups") for (const q of t.args.questions) seen.add(q);
    expect([...seen].sort()).toEqual([...CONFIDENTIAL_CHIPS.en].sort());
  });

  it("chips are answerable, name nobody and stay away from the Wakeb client list", () => {
    const names = testMatcher();
    for (const lang of ["en", "ar"] as const) {
      expect(CONFIDENTIAL_CHIPS[lang].length).toBeGreaterThanOrEqual(4);
      expect(CONFIDENTIAL_CHIPS.ar.length).toBe(CONFIDENTIAL_CHIPS.en.length);
      for (const c of [...CONFIDENTIAL_CHIPS[lang], ...CONFIDENTIAL_FOLLOWUPS[lang]]) {
        expect(answerableFollowup(c), c).toBe(true);
        expect(names.mentions(c), c).toBe(false);
        expect(c).not.toMatch(/wakeb|gadd|defen[cs]e|government|client|واكب|الدفاع|حكومي|عميل/i);
      }
    }
  });
});
