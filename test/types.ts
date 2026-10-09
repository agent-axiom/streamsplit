import {
  assertChunkInvariant, checkChunkInvariant, replayChunkInvariant, generateSchedules,
  CheckAbortedError, StreamSplitError, ChunkInvariantError, type ByteParser, type ParserFactory, type ReproFixture,
} from '../dist/index.js';

const parser: ParserFactory<{ text: string }> = emit => ({
  write(chunk) { emit({ text: new TextDecoder().decode(chunk) }); },
  async end() { await Promise.resolve(); },
});
const input = new Uint8Array([1]);
const coverage = await assertChunkInvariant({ input, createParser: parser });
coverage.parserRuns satisfies number;
const result = await checkChunkInvariant({ input, createParser: parser });
const signal = new AbortController().signal;
await assertChunkInvariant({ input, createParser: parser, signal });
await checkChunkInvariant({ input, createParser: parser, signal });
new CheckAbortedError() satisfies StreamSplitError;
if (!result.ok) {
  const fixture: ReproFixture = result.failure.fixture;
  await replayChunkInvariant({ fixture, createParser: parser });
  await replayChunkInvariant({ fixture, createParser: parser, signal });
  new ChunkInvariantError(result.failure, result.coverage);
}
await assertChunkInvariant({ input, createParser: (emit: (value: Date) => void): ByteParser => ({
  write() { emit(new Date()); },
}), normalizeEvent: date => date.toISOString() });
for (const schedule of generateSchedules(10)) schedule.chunkSizes satisfies number[];
// @ts-expect-error Input is bytes, not already-decoded text.
await assertChunkInvariant({ input: 'text', createParser: parser });
// @ts-expect-error A streaming parser must implement write.
const invalid: ByteParser = { end() {} };
void invalid;
// @ts-expect-error Error comparison policy is explicit.
await checkChunkInvariant({ input, createParser: parser, errorPolicy: 'ignore' });
// @ts-expect-error Supply the controller's signal, not the controller itself.
await checkChunkInvariant({ input, createParser: parser, signal: new AbortController() });
// @ts-expect-error A boolean is not an AbortSignal.
await assertChunkInvariant({ input, createParser: parser, signal: true });
