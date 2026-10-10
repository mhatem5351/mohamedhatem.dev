import { describe, expect, it } from "vitest";
import { createSseParser } from "../../src/sse";

function parse(chunks: string[], end = true) {
  const out: [string, string][] = [];
  const p = createSseParser((e, d) => out.push([e, d]));
  for (const c of chunks) p.push(c);
  if (end) p.end();
  return out;
}

describe("SSE parser", () => {
  it("parses named events and ignores comments (pings)", () => {
    expect(parse([': ping\n\nevent: token\ndata: {"t":"Hi"}\n\n: ping\n\nevent: done\ndata: {}\n\n'])).toEqual([
      ["token", '{"t":"Hi"}'],
      ["done", "{}"],
    ]);
  });

  it("joins multi-line data and defaults the event name to message", () => {
    expect(parse(["data: a\ndata: b\n\n"])).toEqual([["message", "a\nb"]]);
  });

  it("handles CRLF, CR and LF, split anywhere across chunks", () => {
    const text = 'event: token\r\ndata: {"t":"x"}\r\n\r\nevent: meta\rdata: 1\r\revent: done\ndata: 2\n\n';
    const whole = parse([text]);
    expect(whole).toEqual([
      ["token", '{"t":"x"}'],
      ["meta", "1"],
      ["done", "2"],
    ]);
    for (let i = 1; i < text.length; i++) expect(parse([text.slice(0, i), text.slice(i)])).toEqual(whole);
    expect(parse(text.split(""))).toEqual(whole);
  });

  it("keeps a single space after the colon only once and accepts fields without a value", () => {
    expect(parse(["event:token\ndata:  two spaces\n\n"])).toEqual([["token", " two spaces"]]);
    expect(parse(["data\n\n"])).toEqual([["message", ""]]);
  });

  it("flushes a final event without a blank line on end(), and drops nothing mid-stream", () => {
    expect(parse(["event: done\ndata: {}"], false)).toEqual([]);
    expect(parse(["event: done\ndata: {}"])).toEqual([["done", "{}"]]);
  });
});
