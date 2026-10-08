import assert from 'node:assert/strict';
import { assertChunkInvariant, checkChunkInvariant, replayChunkInvariant } from '../../dist/index.js';
import { eventsourceAdapter } from './eventsource.mjs';
import { ndjsonAdapter } from './ndjson.mjs';
import { streamJsonAdapter } from './stream-json.mjs';

const cases = {
  sse: { input: 'data: Hello 🌍\r\n\r\n', createParser: eventsourceAdapter, expected: [{ kind: 'event', data: 'Hello 🌍', event: null, id: null }] },
  ndjson: { input: '{"city":"東京"}\r\n{"emoji":"🌍"}', createParser: ndjsonAdapter, expected: [{ city: '東京' }, { emoji: '🌍' }] },
  json: { input: '[{"city":"東京"},{"value":-1.25e+3}]', createParser: emit => streamJsonAdapter(emit, { paths: ['$.*'] }), expected: [{ city: '東京' }, { value: -1250 }] },
};
const name = process.argv[2] ?? 'sse';
assert.ok(Object.hasOwn(cases, name), 'Choose sse, ndjson, or json.');
const { input: text, createParser, expected } = cases[name];
const input = new TextEncoder().encode(text);
const events = [];
const parser = createParser(value => events.push(value));
await parser.write(input);
await parser.end();
assert.deepEqual(events, expected);
console.log(`${name}: expected semantic output ${JSON.stringify(events)}`);

if (name === 'sse') {
  // Deliberately break the decoding adapter, not the upstream parser.
  const broken = emit => eventsourceAdapter(emit, { streaming: false });
  const result = await checkChunkInvariant({ input, createParser: broken, seed: 42 });
  assert.equal(result.ok, false);
  console.log(`BROKEN: split UTF-8 corrupts ${JSON.stringify(result.failure.actual.events)}`);
  console.log(`REPLAY: exact chunk sizes ${JSON.stringify(result.failure.fixture.chunkSizes)}`);
  assert.equal((await replayChunkInvariant({ fixture: result.failure.fixture, createParser: broken })).ok, false);
  assert.equal((await replayChunkInvariant({ fixture: result.failure.fixture, createParser })).ok, true);
  console.log('FIX: decoder.decode(chunk, { stream: true }); exact fixture now passes');
}
const coverage = await assertChunkInvariant({ input, createParser, seed: 42 });
assert.equal(coverage.allSingleCutsChecked, true);
assert.equal(coverage.bytewiseChecked, true);
console.log(`PASS: ${coverage.schedulesChecked} schedules; every single cut and bytewise reads checked`);
