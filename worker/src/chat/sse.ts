/**
 * Server-Sent Events, both directions.
 *   parseSse: upstream bytes (Gemini `alt=sse`) → `data:` payloads, tolerant of any chunking.
 *   encodeEvent: downstream events to the browser.
 */
export async function* parseSse(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  const onAbort = () => void reader.cancel().catch(() => {});
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        finished = true;
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      // Events end with a blank line; normalise CRLF first.
      buffer = buffer.replace(/\r\n?/g, "\n");
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const data = dataOf(block);
        if (data !== null) yield data;
      }
    }
    buffer += decoder.decode();
    const data = dataOf(buffer.replace(/\r\n?/g, "\n"));
    if (data !== null) yield data;
  } finally {
    signal?.removeEventListener("abort", onAbort);
    // Stopped early (consumer returned, or threw): release the upstream connection.
    if (!finished) await reader.cancel().catch(() => {});
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
}

function dataOf(block: string): string | null {
  const lines = block.split("\n").filter((l) => l.startsWith("data:"));
  if (!lines.length) return null;
  return lines.map((l) => l.slice(l.startsWith("data: ") ? 6 : 5)).join("\n");
}

const enc = new TextEncoder();

export function encodeEvent(event: string, data: unknown): Uint8Array {
  // JSON.stringify never emits raw newlines, so one data line is always enough.
  return enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export const PING = enc.encode(": ping\n\n");
