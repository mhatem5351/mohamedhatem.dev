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

  it("leaves ordinary text alone and never holds it back", () => {
    const f = new TableFilter();
    expect(f.push("He uses a | b notation and ")).toBe("He uses a | b notation and ");
    expect(f.push("lists:\n- one\n- two")).toBe("lists:\n- one\n- two");
    expect(f.push("\n| maybe a row")).toBe("\n");
    expect(f.push(" but not | closed\nnext")).toBe("| maybe a row but not | closed\nnext");
    expect(f.flush()).toBe("");
    expect(run("Arabic: **الملاءمة العامة:** جيدة\n- **نقاط التوافق:** LangGraph")).toBe("Arabic: **الملاءمة العامة:** جيدة\n- **نقاط التوافق:** LangGraph");
  });

  it("inside streamAnswer, a table the model writes reaches the browser as bullets", async () => {
    resetCooldowns();
    const sink = memorySink();
    const fetcher = async () => geminiSse([textChunk("| Client / Project | Focus |\n| :--- | :--- |\n| ArabsStock"), textChunk(" Assistant | 14 agents |\n"), finalChunk()]);
    await streamAnswer("SYS", [{ role: "user", parts: [{ text: "table please" }] }], { apiKey: "k", primary: "m", fallbacks: [], hedgeMs: 1000, fetcher: fetcher as unknown as typeof fetch }, sink, new AbortController().signal);
    expect(sink.text()).toBe("- **ArabsStock Assistant:** 14 agents\n");
    expect(sink.text()).not.toContain("|");
  });
});

beforeEach(() => resetCooldowns());
