import test from 'node:test';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { assertChunkInvariant, checkChunkInvariant, replayChunkInvariant, LimitExceededError } from '../dist/index.js';
import { eventsourceAdapter } from '../examples/integrations/eventsource.mjs';
import { ndjsonAdapter } from '../examples/integrations/ndjson.mjs';
const bytes = text => new TextEncoder().encode(text);
const { version: eventsourceVersion } = createRequire(import.meta.url)('eventsource-parser/package.json');

async function collect(input, createParser) {
  const events = [];
  const parser = await createParser(value => events.push(value));
  await parser.write(input);
  await parser.end();
  return events;
}

test('real eventsource-parser: complete expected events survive every single cut and bytewise reads', async () => {
  const input = bytes(':ping\r\nretry: 1500\r\nid: a1\r\nevent: update\r\ndata: 東京 🌍\r\ndata: café\r\n\r\ndata: done\n\n');
  assert.deepEqual(await collect(input, eventsourceAdapter), [
    { kind: 'comment', comment: 'ping' },
    { kind: 'retry', milliseconds: 1500 },
    { kind: 'event', data: '東京 🌍\ncafé', event: 'update', id: 'a1' },
    { kind: 'event', data: 'done', event: null, id: null },
  ]);
  const coverage = await assertChunkInvariant({ input, createParser: eventsourceAdapter, seed: 2026 });
  assert.equal(coverage.allSingleCutsChecked, true);
  assert.equal(coverage.bytewiseChecked, true);
});

test('real eventsource-parser: deliberately broken adapter yields a replayable UTF-8 regression', async () => {
  const input = bytes('data: Hello 🌍\r\n\r\n');
  const createParser = emit => eventsourceAdapter(emit, { streaming: false });
  const result = await checkChunkInvariant({ input, createParser, seed: 2026 });
  assert.equal(result.ok, false);
  assert.equal(result.failure.fixture.chunkSizes.length, 2);
  assert.equal((await replayChunkInvariant({ fixture: result.failure.fixture, createParser })).ok, false);
  assert.equal((await replayChunkInvariant({ fixture: result.failure.fixture, createParser: eventsourceAdapter })).ok, true);
});

test('real eventsource-parser: incomplete data is not dispatched as a complete event', async () => {
  const input = bytes('retry: nope\r\nunknown: value\ndata: incomplete');
  assert.deepEqual(await collect(input, eventsourceAdapter), []);
  await assertChunkInvariant({ input, createParser: eventsourceAdapter });
});

test('real eventsource-parser: documented v4 diagnostic discard is detected, not labeled a protocol bug', async () => {
  const input = bytes('unknown: value\n');
  const createParser = emit => eventsourceAdapter(emit, { diagnostics: true });
  const result = await checkChunkInvariant({ input, createParser });
  if (eventsourceVersion.startsWith('3.')) {
    assert.equal(result.ok, true);
  } else {
    assert.equal(eventsourceVersion, '4.1.1', 'Review diagnostic expectations when updating the pinned upstream version.');
    assert.equal(result.ok, false);
    assert.equal(result.failure.baseline.events[0].type, 'unknown-field');
    assert.deepEqual(result.failure.actual.events, []);
    assert.equal(result.failure.fixture.chunkSizes.length, 2);
    assert.equal((await replayChunkInvariant({ fixture: result.failure.fixture, createParser })).ok, false);
  }
});

test('real ndjson Transform: expected Unicode records, CRLF and EOF flush are preserved', async () => {
  const input = bytes('{"city":"東京"}\r\n{"emoji":"🌍"}\n\n{"final":"café"}');
  assert.deepEqual(await collect(input, ndjsonAdapter), [{ city: '東京' }, { emoji: '🌍' }, { final: 'café' }]);
  const coverage = await assertChunkInvariant({ input, createParser: ndjsonAdapter, seed: 2026 });
  assert.equal(coverage.allSingleCutsChecked, true);
  assert.equal(coverage.bytewiseChecked, true);
});

test('real ndjson Transform: invalid fixtures compare parser errors without swallowing them', async () => {
  const input = bytes('{"ok":true}\n{"broken":}\n');
  await assertChunkInvariant({ input, createParser: ndjsonAdapter, errorPolicy: 'compare' });
});

test('real ndjson Transform: adapter propagates harness emission limits', async () => {
  await assert.rejects(assertChunkInvariant({ input: bytes('{"a":1}\n'), createParser: ndjsonAdapter, maxEvents: 0 }), LimitExceededError);
});

// This parser consumes bytes directly, including split UTF-8 sequences.
import { streamJsonAdapter } from '../examples/integrations/stream-json.mjs';

for (const [name, text, expected, options] of [
  ['nested values and escaped Unicode', '{"city":"東京 🌍","escaped":"\\uD83C\\uDF0D","text":"a\\\"b\\nc","n":-1.25e+3,"ok":true,"empty":null}', [{ city: '東京 🌍', escaped: '🌍', text: 'a"b\nc', n: -1250, ok: true, empty: null }], {}],
  ['array element selection', '[{"city":"東京"},{"emoji":"🌍"},false,null,[1,2]]', [{ city: '東京' }, { emoji: '🌍' }, false, null, [1, 2]], { paths: ['$.*'] }],
  ['a final number flushed at EOF', '-1.25e+3', [-1250], {}],
  ['concatenated root records', '{"a":"café"}{"b":"🌍"}', [{ a: 'café' }, { b: '🌍' }], { separator: '' }],
]) {
  test(`real @streamparser/json: ${name}`, async () => {
    const input = bytes(text);
    const createParser = emit => streamJsonAdapter(emit, options);
    assert.deepEqual(await collect(input, createParser), expected);
    const coverage = await assertChunkInvariant({ input, createParser, seed: 2026 });
    assert.equal(coverage.allSingleCutsChecked, true);
    assert.equal(coverage.bytewiseChecked, true);
  });
}

test('real @streamparser/json: truncated input preserves the emitted prefix and EOF error', async () => {
  const input = bytes('[{"ok":"🌍"},{"unfinished":');
  const createParser = emit => streamJsonAdapter(emit, { paths: ['$.*'] });
  const events = [];
  const parser = createParser(value => events.push(value));
  parser.write(input);
  assert.throws(() => parser.end());
  assert.deepEqual(events, [{ ok: '🌍' }]);
  await assertChunkInvariant({ input, createParser, errorPolicy: 'compare' });
});

test('real @streamparser/json: adapter propagates harness emission limits', async () => {
  await assert.rejects(assertChunkInvariant({ input: bytes('{"a":1}'), createParser: streamJsonAdapter, maxEvents: 0 }), LimitExceededError);
});
