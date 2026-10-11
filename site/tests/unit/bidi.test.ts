import { describe, expect, it } from "vitest";
import { bidiParts, scriptDir } from "~/lib/bidi";

/** The parts as a compact string: isolated runs in ⟨…⟩ with their direction. */
const show = (text: string, locale: "en" | "ar" = "ar") =>
  bidiParts(text, locale)
    .map((p) => (p.dir ? `⟨${p.dir}:${p.text}⟩` : p.text))
    .join("");

describe("bidiParts (A-01: page direction, other-script runs isolated)", () => {
  it("isolates every Latin run of an Arabic label, never the Arabic around it", () => {
    expect(show("vLLM يخدم Qwen")).toBe("⟨ltr:vLLM⟩ يخدم ⟨ltr:Qwen⟩");
    expect(show("Brave Search عبر MCP")).toBe("⟨ltr:Brave Search⟩ عبر ⟨ltr:MCP⟩");
    expect(show("Whisper وBLIP")).toBe("⟨ltr:Whisper⟩ و⟨ltr:BLIP⟩");
    expect(show("Docker وCI/CD")).toBe("⟨ltr:Docker⟩ و⟨ltr:CI/CD⟩");
  });

  it("keeps edge punctuation and unbalanced brackets outside the run, balanced ones inside", () => {
    expect(show("CI: نحو 950 اختبار وحدة و900 اختبار E2E وaxe")).toBe("⟨ltr:CI⟩: نحو 950 اختبار وحدة و900 اختبار ⟨ltr:E2E⟩ و⟨ltr:axe⟩");
    expect(show("Smart Search (تقريبي)")).toBe("⟨ltr:Smart Search⟩ (تقريبي)");
    expect(show("ETL (Azure Functions)")).toBe("⟨ltr:ETL (Azure Functions)⟩");
    expect(show("الزوار (EN, AR, ZH, TR)")).toBe("الزوار (⟨ltr:EN, AR, ZH, TR⟩)");
    expect(show("إتاحة الوصول (WCAG 2.2 AA)")).toBe("إتاحة الوصول (⟨ltr:WCAG 2.2 AA⟩)");
    expect(show("Worker: توجيه اللغة")).toBe("⟨ltr:Worker⟩: توجيه اللغة");
  });

  it("isolates number ranges (A-02) but leaves plain numbers to the sentence", () => {
    expect(show("سبتمبر 2023 – 2027 (متوقع)")).toBe("سبتمبر ⟨ltr:2023 – 2027⟩ (متوقع)");
    expect(show("مشروعات دراسية (2021–2022)، أبقيتها")).toBe("مشروعات دراسية (⟨ltr:2021–2022⟩)، أبقيتها");
    expect(show("بيانات أكثر من 3,008 من المطوّرين")).toBe("بيانات أكثر من 3,008 من المطوّرين");
    expect(show("96 أداة، منها 27 متاحة للزوار")).toBe("96 أداة، منها 27 متاحة للزوار");
  });

  it("returns an all-Latin label as one run, and an all-Arabic one untouched", () => {
    expect(show("AWS Athena + DuckDB")).toBe("⟨ltr:AWS Athena + DuckDB⟩");
    expect(show("التحليل المكاني")).toBe("التحليل المكاني");
    expect(bidiParts("التحليل المكاني", "ar")).toEqual([{ text: "التحليل المكاني" }]);
  });

  it("on English pages isolates Arabic runs right-to-left and leaves Latin alone", () => {
    expect(show("vLLM serving Qwen", "en")).toBe("vLLM serving Qwen");
    expect(show("Noura (نورة) for visitors", "en")).toBe("Noura (⟨rtl:نورة⟩) for visitors");
  });

  it("never loses or reorders a character", () => {
    for (const s of ["CI: نحو 950 اختبار وحدة و900 اختبار E2E وaxe", "AWS (SageMaker, EC2, S3, Athena, EKS)", "(x) — y", ""]) {
      expect(bidiParts(s, "ar").map((p) => p.text).join("")).toBe(s);
      expect(bidiParts(s, "en").map((p) => p.text).join("")).toBe(s);
    }
  });
});

describe("scriptDir", () => {
  it("is rtl for anything with an Arabic letter", () => {
    expect(scriptDir("vLLM يخدم Qwen")).toBe("rtl");
    expect(scriptDir("LangGraph")).toBe("ltr");
  });
});
