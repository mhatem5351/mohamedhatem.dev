import { describe, expect, it } from "vitest";
import { noBreakHtml } from "~/lib/nobreak";

describe("noBreakHtml (C-02: titles never break inside a hyphenated compound or a domain)", () => {
  it("wraps each hyphenated compound in one unit", () => {
    expect(noBreakHtml("A self-hosted Qwen assistant")).toBe('A <span class="nb-unit">self-hosted</span> Qwen assistant');
    expect(noBreakHtml("ML for real-estate developers")).toBe('ML for <span class="nb-unit">real-estate</span> developers');
    expect(noBreakHtml("answer-quality monitoring, 4-language site")).toBe(
      '<span class="nb-unit">answer-quality</span> monitoring, <span class="nb-unit">4-language</span> site',
    );
  });

  it("keeps a domain and its trailing punctuation together, isolated LTR", () => {
    expect(noBreakHtml("logic-controls.com: a site")).toBe('<span class="nb-unit" dir="ltr">logic-controls.com:</span> a site');
    expect(noBreakHtml("موقع logic-controls.com بأربع لغات")).toBe('موقع <span class="nb-unit" dir="ltr">logic-controls.com</span> بأربع لغات');
  });

  it("escapes HTML and leaves plain titles alone", () => {
    expect(noBreakHtml("R&D <b>")).toBe("R&amp;D &lt;b&gt;");
    expect(noBreakHtml("STA: Noura and the staff assistant")).toBe("STA: Noura and the staff assistant");
  });

  it("takes another class for pages that style the unit themselves", () => {
    expect(noBreakHtml("multi-agent", "nowrap")).toBe('<span class="nowrap">multi-agent</span>');
  });
});
