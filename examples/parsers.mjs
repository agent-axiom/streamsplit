// Illustrative framing adapters, not production parser replacements.
// Both buffer partial lines and support LF / CRLF. Only decoding differs.
function lines(emitLine, streaming) {
  const decoder = new TextDecoder();
  let pending = '';
  const append = text => {
    pending += text;
    let newline;
    while ((newline = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, newline).replace(/\r$/, '');
      pending = pending.slice(newline + 1);
      emitLine(line);
    }
  };
  return {
    write(chunk) { append(decoder.decode(chunk, { stream: streaming })); },
    end() {
      append(decoder.decode());
      if (pending) { emitLine(pending.replace(/\r$/, '')); pending = ''; }
    },
  };
}
export function ndjsonParser(emit, { streaming = true } = {}) {
  return lines(line => { if (line.trim()) emit(JSON.parse(line)); }, streaming);
}
// A deliberate SSE subset: data fields, comments, multiline payloads, blank-line dispatch.
// This example omits id, event, retry, BOM, lone CR, and reconnection semantics.
export function sseDataParser(emit, { streaming = true } = {}) {
  let data = [];
  return lines(line => {
    if (line === '') {
      if (data.length) emit({ data: data.join('\n') });
      data = [];
    } else if (line === 'data') {
      data.push('');
    } else if (line.startsWith('data:')) {
      data.push(line.slice(5).replace(/^ /, ''));
    }
  }, streaming);
}
export const brokenNdjsonParser = emit => ndjsonParser(emit, { streaming: false });
export const brokenSseDataParser = emit => sseDataParser(emit, { streaming: false });
