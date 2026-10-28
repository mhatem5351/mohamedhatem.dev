import { beforeEach, describe, expect, it } from "vitest";
import { ApartFilter, type ApartMode } from "../src/chat/apart";
import { streamAnswer } from "../src/chat/answer";
import { resetCooldowns } from "../src/chat/cooldown";
import { finalChunk, geminiSse, memorySink, textChunk } from "./helpers";

const run = (mode: ApartMode, text: string, size = text.length) => {
  const f = new ApartFilter(mode);
  let out = "";
  for (let i = 0; i < text.length; i += size) out += f.push(text.slice(i, i + size));
  return out + f.flush();
};

// Answers seen in the round-6 evaluation (gemini-3.1-flash-lite).
const CLIENTS_PARAGRAPH =
  "The Saudi Ministry of Defense (GADD) is a client of his Wakeb Data role as a whole, not of any one specific project. Additionally, he built a bilingual enterprise assistant for a Saudi government client, but for confidentiality, that client is not named.\n";
const CLIENTS_LIST = [
  "At Wakeb Data, Hatem's work served several projects and a specific client:",
  "",
  "- **Saudi Ministry of Defense (GADD):** a client of his role at Wakeb Data as a whole, not of any one project.",
  "- **6-agent bilingual chatbot:** LangGraph and Qwen, served with vLLM on A100 GPUs.",
  "- **Bilingual enterprise assistant:** He built this for a Saudi government client (name confidential).",
  "- **AIP semantic search v2:** the second version of the AIP project's semantic search.",
  "",
].join("\n");
const GOV_ANSWER =
  "For confidentiality, the client of the bilingual enterprise assistant isn't named, so I can't say anything about who it is. The Saudi Ministry of Defense (GADD) is a client of his Wakeb Data role as a whole.";

describe("GADD and the government assistant never share an answer (R6-01, R6-02)", () => {
  it("clients turn: the sentence about the government assistant goes, GADD stays, at any chunk size", () => {
    for (const size of [1, 3, 7, 40, CLIENTS_PARAGRAPH.length])
      expect(run("clients", CLIENTS_PARAGRAPH, size), String(size)).toBe(
        "The Saudi Ministry of Defense (GADD) is a client of his Wakeb Data role as a whole, not of any one specific project. ",
      );
  });

  it("clients turn: the list item about the government assistant goes, the other items stay", () => {
    const out = run("clients", CLIENTS_LIST, 5);
    expect(out).toContain("GADD");
    expect(out).toContain("- **6-agent bilingual chatbot:**");
    expect(out).toContain("- **AIP semantic search v2:**");
    expect(out).not.toMatch(/government client|enterprise assistant/i);
  });

  it("government-assistant turn: the GADD sentence goes", () => {
    expect(run("gov", GOV_ANSWER, 4)).toBe(
      "For confidentiality, the client of the bilingual enterprise assistant isn't named, so I can't say anything about who it is. ",
    );
    expect(run("gov", "- **GADD:** a client of the role.\n- He built a bilingual enterprise assistant for a Saudi government client.\n")).toBe(
      "- He built a bilingual enterprise assistant for a Saudi government client.\n",
    );
  });

  it("other Wakeb turns: the first of the two stays; a sentence naming both always goes; Arabic too", () => {
    expect(run("first", "He built a bilingual enterprise assistant for a Saudi government client. GADD is a client of the role. He also served Qwen.")).toBe(
      "He built a bilingual enterprise assistant for a Saudi government client. He also served Qwen.",
    );
    expect(run("first", "GADD and a different Saudi government client were his clients. He served Qwen with vLLM.")).toBe("He served Qwen with vLLM.");
    expect(run("clients", "وزارة الدفاع السعودية (GADD) عميل لدوره في Wakeb Data عمومًا.\n- **مساعد مؤسسي ثنائي اللغة:** لجهة حكومية سعودية.\n- **روبوت محادثة:** 6 وكلاء.\n")).toBe(
      "وزارة الدفاع السعودية (GADD) عميل لدوره في Wakeb Data عمومًا.\n- **روبوت محادثة:** 6 وكلاء.\n",
    );
  });

  it("clients turn: no hint at a client it doesn't name (seen live: 'projects for two specific clients… where the client isn't named')", () => {
    const text =
      "At Wakeb Data, Mohamed Hatem worked on projects for two specific clients, while managing other work. The Saudi Ministry of Defense (GADD) is a client of his Wakeb Data role as a whole.\n\nFor other projects at Wakeb Data where the client isn't named or the work was internal:\n- **AIP semantic search v2:** the second version.\n";
    expect(run("clients", text, 6)).toBe("The Saudi Ministry of Defense (GADD) is a client of his Wakeb Data role as a whole.\n\n- **AIP semantic search v2:** the second version.\n");
    // Other named clients may still be listed.
    expect(run("clients", "Other clients he worked for: the Saudi Tourism Authority (through Globant) and AestheticsPro.")).toBe(
      "Other clients he worked for: the Saudi Tourism Authority (through Globant) and AestheticsPro.",
    );
  });

  it("text about neither passes unchanged and is never held past the end of a sentence", () => {
    const f = new ApartFilter("first");
    expect(f.push("At Wakeb Data he served Qwen. He also ")).toBe("At Wakeb Data he served Qwen. ");
    expect(f.push("ran CI/CD.\n- one")).toBe("He also ran CI/CD.\n");
    expect(f.flush()).toBe("- one");
  });

  it("inside streamAnswer: a clients answer never shows the government assistant", async () => {
    resetCooldowns();
    const sink = memorySink();
    const pieces = CLIENTS_LIST.match(/[\s\S]{1,9}/g)!.map((p) => textChunk(p));
    const fetcher = async () => geminiSse([...pieces, finalChunk()]);
    await streamAnswer("SYS", [{ role: "user", parts: [{ text: "clients?" }] }], { apiKey: "k", primary: "m", fallbacks: [], hedgeMs: 1000, fetcher: fetcher as unknown as typeof fetch, apart: "clients" }, sink, new AbortController().signal);
    expect(sink.text()).toContain("GADD");
    expect(sink.text()).not.toMatch(/government client|enterprise assistant/i);
  });
});

describe("R7-05: paraphrases of either side, and sentences that relate the two", () => {
  // Seen offline in round 7: each of these passed the filter, so both sides reached the visitor.
  const GOV = "He built a bilingual enterprise assistant for a Saudi government client (name confidential).";
  it("GADD's other names count as GADD", () => {
    for (const gadd of [
      "His Wakeb role also served the General Authority for Defense Development.",
      "The Saudi MoD is a client of his Wakeb role as a whole.",
      "كما خدم دوره في Wakeb Data الهيئة العامة للتطوير الدفاعي.",
      "The Saudi Defence Ministry is a client of the role.",
    ])
      expect(run("first", `${GOV} ${gadd}`), gadd).toBe(`${GOV} `);
  });

  it("the government assistant's other wordings count as it, the fixed reply's own included", () => {
    for (const gov of [
      "He also delivered an Arabic/English enterprise assistant for a public-sector organisation in Saudi Arabia.",
      "Separately, he built a bilingual (Arabic/English) enterprise assistant with LLM evaluation and observability monitoring.",
      "He also worked for a second Saudi public body.",
      "What is public: it is a bilingual (Arabic/English) enterprise assistant for a Saudi government client.",
    ])
      expect(run("first", `The Saudi Ministry of Defense (GADD) is a client of his role. ${gov}`), gov).toBe("The Saudi Ministry of Defense (GADD) is a client of his role. ");
    expect(run("clients", "The Saudi Ministry of Defense (GADD) is a client of his Wakeb Data role. He also worked for a second Saudi public body.")).toBe(
      "The Saudi Ministry of Defense (GADD) is a client of his Wakeb Data role. ",
    );
  });

  it("a sentence relating organisations goes, even without either name", () => {
    expect(run("gov", "No, that's a different organisation from his role-level client. For confidentiality, the client isn't named.")).toBe(
      "For confidentiality, the client isn't named.",
    );
    expect(run("clients", "GADD is a client of his Wakeb role. It is not the same entity as any other client.")).toBe("GADD is a client of his Wakeb role. ");
    // Other clients by name are not a relation.
    expect(run("clients", "Other clients he worked for: the Saudi Tourism Authority (through Globant) and AestheticsPro.")).toBe(
      "Other clients he worked for: the Saudi Tourism Authority (through Globant) and AestheticsPro.",
    );
  });

  it("an answer about neither is untouched on a turn that names neither (the filter runs on every turn)", () => {
    const text = "Before Globant he worked at Wakeb Data and ArabsStock.\n\n- **ArabsStock:** 14 agents.\n- **Wakeb Data:** a 6-agent chatbot.\n";
    for (const size of [1, 5, text.length]) expect(run("first", text, size)).toBe(text);
    // The Saudi Tourism Authority described as a government body is not the government assistant.
    expect(run("clients", "The Saudi Tourism Authority, a government agency, is his current client. GADD is a client of his Wakeb role.")).toBe(
      "The Saudi Tourism Authority, a government agency, is his current client. GADD is a client of his Wakeb role.",
    );
  });
});

beforeEach(() => resetCooldowns());
