import { assertChunkInvariant, checkChunkInvariant, replayChunkInvariant } from '../dist/index.js';
import { brokenSseDataParser, sseDataParser, ndjsonParser } from './parsers.mjs';

const input = new TextEncoder().encode('data: Hello 🌍\r\n\r\ndata: café\n\n');
const result = await checkChunkInvariant({ input, createParser: brokenSseDataParser, seed: 42 });
if (result.ok) throw new Error('The deliberately broken decoder unexpectedly passed.');
console.log('Found the UTF-8 bug:', {
  firstDifferentEvent: result.failure.firstDifferentEvent,
  failingChunkSizes: result.failure.fixture.chunkSizes,
  shrink: result.failure.shrink,
});
// Fixtures contain the exact original bytes. Persist only safe test data.
const fixture = JSON.parse(JSON.stringify(result.failure.fixture));
const replay = await replayChunkInvariant({ fixture, createParser: brokenSseDataParser });
if (replay.ok) throw new Error('Fixture did not reproduce.');
console.log('Replay confirmed.');
const coverage = await assertChunkInvariant({ input, createParser: sseDataParser, seed: 42 });
console.log('Fixed SSE decoder passed:', coverage);
await assertChunkInvariant({
  input: new TextEncoder().encode('{"city":"東京"}\r\n{"emoji":"🧪"}\n'),
  createParser: ndjsonParser,
});
console.log('Streaming NDJSON decoder passed.');
