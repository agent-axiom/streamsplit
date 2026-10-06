import test from 'node:test';
import assert from 'node:assert/strict';
import { assertChunkInvariant, checkChunkInvariant } from '../dist/index.js';
import { sseDataParser, brokenSseDataParser, ndjsonParser, brokenNdjsonParser } from '../examples/parsers.mjs';
const bytes = text => new TextEncoder().encode(text);

for (const [name, input, fixed, broken] of [
  ['SSE', bytes(': comment\r\ndata: 東京 🌍\r\ndata: café\r\n\r\ndata: done\n\n'), sseDataParser, brokenSseDataParser],
  ['NDJSON', bytes('{"city":"東京"}\r\n{"emoji":"🌍"}\n\n{"name":"café"}'), ndjsonParser, brokenNdjsonParser],
]) {
  test(`${name}: broken UTF-8 decoding is caught; streaming decoder survives all tested partitions`, async () => {
    const result = await checkChunkInvariant({ input, createParser: broken, seed: 17 });
    assert.equal(result.ok, false);
    assert.ok(result.failure.fixture.chunkSizes.length >= 2);
    assert.notDeepEqual(result.failure.baseline.events, result.failure.actual.events);
    assert.ok(result.failure.baseline.events.length > 1);
    const coverage = await assertChunkInvariant({ input, createParser: fixed, seed: 17 });
    assert.equal(coverage.allSingleCutsChecked, true);
    assert.equal(coverage.bytewiseChecked, true);
  });
}
