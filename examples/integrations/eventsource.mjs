import { createParser } from 'eventsource-parser';

/** Adapt the real eventsource-parser package to StreamSplit's byte lifecycle. */
export function eventsourceAdapter(emit, { streaming = true, diagnostics = false } = {}) {
  const decoder = new TextDecoder();
  const parser = createParser({
    onEvent(event) {
      // The parser uses undefined for absent optional fields; make JSON semantics explicit.
      emit({ kind: 'event', data: event.data, event: event.event ?? null, id: event.id ?? null });
    },
    onComment(comment) { emit({ kind: 'comment', comment }); },
    onRetry(milliseconds) { emit({ kind: 'retry', milliseconds }); },
    onError(error) {
      if (diagnostics) emit({ kind: 'parse-error', type: error.type, field: error.field ?? null, value: error.value ?? null });
    },
  });
  return {
    write(chunk) { parser.feed(decoder.decode(chunk, { stream: streaming })); },
    end() { parser.feed(decoder.decode()); parser.reset({ consume: true }); },
  };
}
