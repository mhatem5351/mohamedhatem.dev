import { beforeEach, describe, expect, it } from "vitest";
import { streamAnswer } from "../src/chat/answer";
import { resetCooldowns } from "../src/chat/cooldown";
import { TableFilter } from "../src/chat/tables";
import { finalChunk, geminiSse, memorySink, textChunk } from "./helpers";

/** Runs the filter over `text` cut into pieces of `size` characters. */
const run = (text: string, size = text.length) => {
  const f = new TableFilter();
  let out = "";
  for (let i = 0; i < text.length; i += size) out += f.push(text.slice(i, i + size));
  return out + f.flush();
};

describe("tables become bullets (R6-09)", () => {
  const table = [
    "Two Wakeb projects:",
    "",
    "| Project | Agents | Stack |",
    "| :--- | :---: | --- |",
    "| **Wakeb chatbot** | 6 | vLLM, Qwen |",
    "| AIP search v2 | | semantic search |",
    "",
    "More in [Experience](https://mohamedhatem.dev/#experience).",
  ].join("\n");
  const bullets = [
    "Two Wakeb projects:",
    "",
    "- **Wakeb chatbot:** 6 · vLLM, Qwen",
    "- **AIP search v2:** semantic search",
    "",
    "More in [Experience](https://mohamedhatem.dev/#experience).",
  ].join("\n");

  it("drops the header and separator rows and turns every row into one bullet, at any chunk size", () => {
    for (const size of [1, 2, 3, 5, 8, 13, table.length]) expect(run(table, size), String(size)).toBe(bullets);
  });

  it("rows without a separator become bullets too; a table at the very end is flushed", () => {
    expect(run("| ArabsStock Assistant | 14 agents |\n| Wakeb chatbot | 6 agents |")).toBe("- **ArabsStock Assistant:** 14 agents\n- **Wakeb chatbot:** 6 agents");
    expect(run("Intro\n| A | B |\n|---|---|\n| x | y |")).toBe("Intro\n- **x:** y");
  });

  it("never holds back text without a pipe, and holds a line with one only until the next line shows no separator", () => {
    const f = new TableFilter();
    // A pipe-free line passes at once, whole (a stalled answer must still reach the visitor).
    expect(f.push("A fuller answer that then stalls")).toBe("A fuller answer that then stalls");
    expect(f.push(" and resumes.\nShort")).toBe(" and resumes.\nShort");
    // From the first "|" of a short line: held, since it may be a header row without outer pipes (R7-13)...
    expect(f.push("\nHe uses a | b notation and ")).toBe("\nHe uses a ");
    // ...until the next line shows it isn't followed by a separator; then it passes unchanged.
    expect(f.push("lists:\n- one\n- two")).toBe("| b notation and lists:\n- one\n- two");
    expect(f.push("\n| maybe a row")).toBe("\n");
    expect(f.push(" but not | closed\nnext")).toBe("| maybe a row but not | closed\nnext");
    // A sentence before the first "|" can't be a header cell: the line passes as it comes, pipe included.
    expect(f.push("\nHe mostly writes notes, then a | b")).toBe("\nHe mostly writes notes, then a | b");
    expect(f.flush()).toBe("");
    expect(run("Arabic: **الملاءمة العامة:** جيدة\n- **نقاط التوافق:** LangGraph")).toBe("Arabic: **الملاءمة العامة:** جيدة\n- **نقاط التوافق:** LangGraph");
  });

  it("a long line with a pipe is never held to its end: it can't be a header row (R7-13)", () => {
    const f = new TableFilter();
    const long = `Use A | B ${"and more words ".repeat(25)}`;
    expect(long.length).toBeGreaterThan(300);
    expect(f.push(long.slice(0, 200))).toBe("Use A ");
    expect(f.push(long.slice(200))).toBe(long.slice(6));
    expect(f.flush()).toBe("");
  });
});

/** Every chunk size the tests below run at: one character, small odd sizes and the whole text. */
const SIZES = [1, 3, 7, Infinity];
const runAll = (text: string) => SIZES.map((s) => run(text, s === Infinity ? text.length : s));

describe("tables without outer pipes become bullets too (R7-13)", () => {
  // Text without "|" is never held back, so the header's first cell is already sent when its "|" arrives: the rest of
  // the header becomes a caption ("Client · Project") instead of being dropped, the same at every chunk size.
  it("the GFM example: header, separator and rows without leading or trailing pipes", () => {
    for (const out of runAll("Client | Project\n--- | ---\nArabsStock | 14 agents\n")) expect(out).toBe("Client · Project\n- **ArabsStock:** 14 agents\n");
    for (const out of runAll("Client | Project\n--- | ---\nArabsStock | 14 agents")) expect(out).toBe("Client · Project\n- **ArabsStock:** 14 agents");
    for (const out of runAll("Client|Project|\n---|---\nArabsStock|14 agents|\n")) expect(out).toBe("Client · Project\n- **ArabsStock:** 14 agents\n");
  });

  it("mixed with surrounding text, alignment colons, outer pipes on some lines and a blank line after", () => {
    const text = [
      "Two systems compared:",
      "",
      "Project | Agents | Stack",
      ":--- | :---: | ---:",
      "**ArabsStock Assistant** | 14 | LangGraph",
      "| Wakeb chatbot | 6 | vLLM, Qwen |",
      "",
      "He leads the AI engineering at STA. A | B in a sentence stays.",
      "More in [Experience](https://mohamedhatem.dev/#experience).",
    ].join("\n");
    const bullets = [
      "Two systems compared:",
      "",
      "Project · Agents · Stack",
      "- **ArabsStock Assistant:** 14 · LangGraph",
      "- **Wakeb chatbot:** 6 · vLLM, Qwen",
      "",
      "He leads the AI engineering at STA. A | B in a sentence stays.",
      "More in [Experience](https://mohamedhatem.dev/#experience).",
    ].join("\n");
    for (const [i, out] of runAll(text).entries()) expect(out, `size ${SIZES[i]}`).toBe(bullets);
  });

  it("Arabic cells", () => {
    const text = "أبرز أنظمته:\nالمشروع | الوكلاء | التقنيات\n--- | --- | ---\nArabsStock | 14 وكيلًا | LangGraph\nروبوت Wakeb | 6 وكلاء | vLLM وQwen\n\nالتفاصيل في دراسات الحالة.";
    const bullets = "أبرز أنظمته:\nالمشروع · الوكلاء · التقنيات\n- **ArabsStock:** 14 وكيلًا · LangGraph\n- **روبوت Wakeb:** 6 وكلاء · vLLM وQwen\n\nالتفاصيل في دراسات الحالة.";
    for (const [i, out] of runAll(text).entries()) expect(out, `size ${SIZES[i]}`).toBe(bullets);
  });

  it("the table ends at the first line without a pipe, even without a blank line", () => {
    for (const out of runAll("A | B\n--- | ---\nx | y\nPlain line after.\nC | D\n")) expect(out).toBe("A · B\n- **x:** y\nPlain line after.\nC | D\n");
  });

  it("ordinary text with a pipe stays exactly as written at every chunk size", () => {
    for (const text of [
      "A | B",
      "A | B\n",
      "A | B\nC | D",
      "He uses a | b notation and lists:\n- one\n- two",
      "Use A | B\n- --- not a separator\n",
      "Single column\n---\nis a heading underline, not a table",
      "x | y\n| --- |\nnot a table either",
      "- **Item** | with a pipe\n--- | ---\n",
      "A sentence, then | a pipe\n--- | ---\nrow | here",
    ])
      for (const [i, out] of runAll(text).entries()) expect(out, `${JSON.stringify(text)} size ${SIZES[i]}`).toBe(text);
  });

  it("piped tables keep their behaviour at every chunk size, including a separator without a leading pipe", () => {
    for (const out of runAll("| A | B |\n---|---\n| x | y |\n")) expect(out).toBe("- **x:** y\n");
    for (const out of runAll("| ArabsStock Assistant | 14 agents |\n| Wakeb chatbot | 6 agents |"))
      expect(out).toBe("- **ArabsStock Assistant:** 14 agents\n- **Wakeb chatbot:** 6 agents");
  });
});

describe("tables inside streamAnswer", () => {
  const ask = async (chunks: string[]) => {
    resetCooldowns();
    const sink = memorySink();
    const fetcher = async () => geminiSse([...chunks.map((c) => textChunk(c)), finalChunk()]);
    await streamAnswer("SYS", [{ role: "user", parts: [{ text: "table please" }] }], { apiKey: "k", primary: "m", fallbacks: [], hedgeMs: 1000, fetcher: fetcher as unknown as typeof fetch }, sink, new AbortController().signal);
    return sink.text();
  };

  it("a table the model writes reaches the browser as bullets", async () => {
    const text = await ask(["| Client / Project | Focus |\n| :--- | :--- |\n| ArabsStock", " Assistant | 14 agents |\n"]);
    expect(text).toBe("- **ArabsStock Assistant:** 14 agents\n");
    expect(text).not.toContain("|");
  });

  it("so does a table without outer pipes (R7-13)", async () => {
    const text = await ask(["Here:\nProject | Fo", "cus\n--- | ---\nArabsStock Assistant | 14 agents\nWakeb chatbot", " | 6 agents\n\nAnything else?"]);
    expect(text).toBe("Here:\nProject · Focus\n- **ArabsStock Assistant:** 14 agents\n- **Wakeb chatbot:** 6 agents\n\nAnything else?");
    expect(text).not.toContain("|");
  });
});

beforeEach(() => resetCooldowns());
