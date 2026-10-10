import { describe, expect, it } from "vitest";
import { renderMarkdown, safeHref } from "../../src/markdown";

const emails = ["hatem@mohamedhatem.dev", "mhatem5351@gmail.com"];

const html = (src: string, opts = {}) => {
  const div = document.createElement("div");
  div.append(renderMarkdown(src, opts));
  return div.innerHTML;
};

describe("markdown: blocks", () => {
  it("renders paragraphs with line breaks", () => {
    expect(html("one\ntwo\n\nthree")).toBe("<p>one<br>two</p><p>three</p>");
  });

  it("renders bullet and numbered lists, one nesting level, and loose lists", () => {
    expect(html("- a\n- b\n  - b1\n- c")).toBe("<ul><li>a</li><li>b<ul><li>b1</li></ul></li><li>c</li></ul>");
    expect(html("1. x\n\n2. y")).toBe("<ol><li>x</li><li>y</li></ol>");
    expect(html("3) x\n4) y")).toBe('<ol start="3"><li>x</li><li>y</li></ol>');
    expect(html("intro:\n- a\n\nafter")).toBe("<p>intro:</p><ul><li>a</li></ul><p>after</p>");
  });

  it("renders fenced code (also unclosed while streaming) as text", () => {
    expect(html("```py\nprint('<b>')\n```")).toBe('<pre dir="ltr"><code>print(\'&lt;b&gt;\')</code></pre>');
    expect(html("```\nhalf")).toBe('<pre dir="ltr"><code>half</code></pre>');
  });

  it("turns headings into bold paragraphs and supports rules", () => {
    expect(html("## Skills\n---")).toBe("<p><strong>Skills</strong></p><hr>");
  });
});

describe("markdown: inline", () => {
  it("renders bold, italic, code and escapes", () => {
    expect(html("**bold** and *it* and _it2_ and `x<y>` \\*no\\*")).toBe(
      "<p><strong>bold</strong> and <em>it</em> and <em>it2</em> and <code>x&lt;y&gt;</code> *no*</p>",
    );
  });

  it("does not treat snake_case or arithmetic as emphasis", () => {
    expect(html("staged_llm_evaluator and 5 * 3 * 2")).toBe("<p>staged_llm_evaluator and 5 * 3 * 2</p>");
  });

  it("is streaming-tolerant: unclosed bold, half links", () => {
    expect(html("an **AI Team")).toBe("<p>an <strong>AI Team</strong></p>");
    expect(html("see [his GitHub](https://gith")).toBe("<p>see his GitHub</p>");
    expect(html("see [his Git")).toBe("<p>see [his Git</p>");
  });

  it("never parses raw HTML", () => {
    const out = html('<img src=x onerror="alert(1)"> <script>alert(1)</script>');
    expect(out).toBe("<p>&lt;img src=x onerror=\"alert(1)\"&gt; &lt;script&gt;alert(1)&lt;/script&gt;</p>");
  });
});

describe("markdown: links", () => {
  it("allows http(s), mailto, tel, site paths and #sections; external links open safely", () => {
    expect(html("[GitHub](https://github.com/mhatem5351)")).toBe(
      '<p><a href="https://github.com/mhatem5351" target="_blank" rel="noopener noreferrer">GitHub</a></p>',
    );
    expect(html("[mail](mailto:hatem@mohamedhatem.dev)")).toBe('<p><a href="mailto:hatem@mohamedhatem.dev">mail</a></p>');
    expect(html("[exp](#experience)")).toBe('<p><a href="#experience">exp</a></p>');
  });

  it("drops dangerous or odd schemes and keeps the text", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "//evil.example", "vbscript:x", "file:///etc/passwd", "evil"]) {
      expect(safeHref(bad)).toBeNull();
      expect(html(`[click](${bad})`)).not.toContain("<a");
    }
  });

  it("autolinks bare URLs and the site's own emails, without trailing punctuation", () => {
    expect(html("Email hatem@mohamedhatem.dev or see https://github.com/mhatem5351.", { emails })).toBe(
      '<p>Email <a href="mailto:hatem@mohamedhatem.dev">hatem@mohamedhatem.dev</a> or see <a href="https://github.com/mhatem5351" target="_blank" rel="noopener noreferrer">https://github.com/mhatem5351</a>.</p>',
    );
    expect(html("Write to Hatem@MohamedHatem.dev", { emails })).toBe('<p>Write to <a href="mailto:Hatem@MohamedHatem.dev">Hatem@MohamedHatem.dev</a></p>');
  });

  it("leaves any other email address as plain text (a planted address never becomes a link)", () => {
    expect(html("Email recruiter@evil.example for details, or hatem@mohamedhatem.dev.", { emails })).toBe(
      '<p>Email recruiter@evil.example for details, or <a href="mailto:hatem@mohamedhatem.dev">hatem@mohamedhatem.dev</a>.</p>',
    );
    expect(html("recruiter@evil.example")).toBe("<p>recruiter@evil.example</p>");
  });

  it("refuses paths the URL parser would turn into another host (backslash, tab, newline, other spaces)", () => {
    for (const bad of ["/\\evil.example/login", "/\t/evil.example/login", "/\n/evil.example", "/\u2028/evil.example", "/ /evil.example", "https://evil.example\\@mohamedhatem.dev"]) {
      expect(safeHref(bad)).toBeNull();
    }
    expect(html("See [apply here](/\\evil.example/login) now.")).toBe("<p>See apply here now.</p>");
    expect(html("See [apply here](/\t/evil.example/login) now.")).toBe("<p>See apply here now.</p>");
  });

  it("allows paths on this site only", () => {
    expect(safeHref("/cv/")).toBe(`${location.origin}/cv/`);
    expect(safeHref("/ar/#contact")).toBe(`${location.origin}/ar/#contact`);
    expect(html("[CV](/cv/)")).toBe(`<p><a href="${location.origin}/cv/">CV</a></p>`);
  });
});

describe("markdown: Arabic phone numbers", () => {
  const phone = (out: string) => out.match(/<span dir="ltr"[^>]*>([^<]*)<\/span>/)?.[1];

  it("isolates the number left-to-right in plain text, + first and grouping kept, punctuation outside", () => {
    const out = html("رقمه على واتساب +20 114 207 0946.", { isolate: true });
    expect(out).toBe('<p>رقمه على واتساب <span dir="ltr" class="nw">+20 114 207 0946</span>.</p>');
    expect(html("(+20 114 207 0946)", { isolate: true })).toBe('<p>(<span dir="ltr" class="nw">+20 114 207 0946</span>)</p>');
  });

  it("isolates it inside a link label (the canonical WhatsApp link) and inside bold", () => {
    expect(html("- **واتساب:** [+20 114 207 0946](https://wa.me/201142070946)", { isolate: true })).toBe(
      '<ul><li><strong>واتساب:</strong> <a href="https://wa.me/201142070946" target="_blank" rel="noopener noreferrer"><span dir="ltr" class="nw">+20 114 207 0946</span></a></li></ul>',
    );
    expect(phone(html("اتصل على **+20 114 207 0946** الآن", { isolate: true }))).toBe("+20 114 207 0946");
    expect(phone(html("[+20 114 207 0946](tel:+201142070946)", { isolate: true }))).toBe("+20 114 207 0946");
  });

  it("leaves English answers alone", () => {
    expect(html("WhatsApp: +20 114 207 0946")).toBe("<p>WhatsApp: +20 114 207 0946</p>");
  });
});

describe("markdown: options", () => {
  it("appends the streaming cursor to the last block, inside lists too", () => {
    expect(html("Hello", { cursor: true })).toBe('<p>Hello<span class="cursor" aria-hidden="true"></span></p>');
    expect(html("- a\n- b", { cursor: true })).toBe('<ul><li>a</li><li>b<span class="cursor" aria-hidden="true"></span></li></ul>');
  });

  it("isolates Latin runs in right-to-left text", () => {
    expect(html("يعمل في **Globant** على LangGraph", { isolate: true })).toBe(
      '<p>يعمل في <strong><span dir="ltr" class="nw">Globant</span></strong> على <span dir="ltr" class="nw">LangGraph</span></p>',
    );
  });
});
