/**
 * Incremental Server-Sent Events parser (the subset of the WHATWG spec the Worker uses): `event:` and `data:`
 * fields, multi-line data, `:` comments (keep-alive pings, ignored), CRLF / CR / LF line endings split anywhere
 * across chunks. An event is dispatched on a blank line; `end()` flushes a final event that lacks one.
 */
export interface SseParser {
  push(chunk: string): void;
  end(): void;
}

export function createSseParser(onEvent: (event: string, data: string) => void): SseParser {
  let buf = "";
  let event = "";
  let data: string[] = [];

  const dispatch = () => {
    if (data.length) onEvent(event || "message", data.join("\n"));
    event = "";
    data = [];
  };

  const line = (l: string) => {
    if (!l) return dispatch();
    if (l[0] === ":") return;
    const i = l.indexOf(":");
    const field = i < 0 ? l : l.slice(0, i);
    let value = i < 0 ? "" : l.slice(i + 1);
    if (value[0] === " ") value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  };

  return {
    push(chunk) {
      buf += chunk;
      let start = 0;
      for (let i = 0; i < buf.length; i++) {
        const c = buf[i];
        if (c !== "\n" && c !== "\r") continue;
        // A trailing CR may be the first half of a CRLF that arrives with the next chunk.
        if (c === "\r" && i === buf.length - 1) break;
        line(buf.slice(start, i));
        if (c === "\r" && buf[i + 1] === "\n") i++;
        start = i + 1;
      }
      buf = buf.slice(start);
    },
    end() {
      if (buf) line(buf.replace(/\r$/, ""));
      buf = "";
      dispatch();
    },
  };
}
