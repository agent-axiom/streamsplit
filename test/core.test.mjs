import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertChunkInvariant, checkChunkInvariant, replayChunkInvariant, generateSchedules,
  ChunkInvariantError, ConfigurationError, LimitExceededError,
  NonDeterministicParserError, ParserTimeoutError, BaselineParserError, InvalidEventError,
} from '../dist/index.js';

const bytes = value => new TextEncoder().encode(value);
const quiet = () => ({ write() {} });
const compact = { randomCases: 0, maxSingleCuts: 4, maxShrinkRuns: 16 };
function collector(emit) {
  const collected = [];
  return { write(chunk) { collected.push(...chunk); }, end() { emit(collected); } };
}

test('whole-buffer equivalence with fresh parser instances and immutable inputs', async () => {
  let factories = 0;
  const input = bytes('hello 🌍');
  const expected = input.slice();
  const coverage = await assertChunkInvariant({ input, createParser(emit) {
    factories++;
    const parser = collector(emit);
    return { write(chunk) { parser.write(chunk); chunk.fill(0); }, end: parser.end };
  } });
  assert.deepEqual(input, expected);
  assert.equal(factories, coverage.parserRuns);
  assert.equal(coverage.allSingleCutsChecked, true);
  assert.equal(coverage.bytewiseChecked, true);
});

test('detects different event boundaries even when the final concatenated text matches', async () => {
  const result = await checkChunkInvariant({ input: bytes('abc'), createParser: emit => ({ write(c) { emit(new TextDecoder().decode(c)); } }), ...compact });
  assert.equal(result.ok, false);
  assert.deepEqual(result.failure.baseline.events, ['abc']);
  assert.equal(result.failure.firstDifferentEvent, 0);
  assert.equal(result.failure.fixture.chunkSizes.length, 2);
  assert.equal(result.failure.shrink.complete, true);
  assert.equal((await replayChunkInvariant({ fixture: JSON.parse(JSON.stringify(result.failure.fixture)), createParser: emit => ({ write(c) { emit(new TextDecoder().decode(c)); } }) })).ok, false);
});

test('assertion is typed and its message does not leak payload', async () => {
  await assert.rejects(assertChunkInvariant({ input: bytes('private-content'), createParser: emit => ({ write(c) { emit(c.length); } }), ...compact }), error => {
    assert.ok(error instanceof ChunkInvariantError);
    assert.ok(error.failure.fixture.inputHex);
    assert.equal(error.message.includes('private-content'), false);
    return true;
  });
});

test('awaits async factory, write, end and emitted events', async () => {
  await assertChunkInvariant({ input: bytes('async'), ...compact, createParser: async emit => {
    const all = [];
    await Promise.resolve();
    return { async write(c) { await Promise.resolve(); all.push(...c); }, async end() { await Promise.resolve(); emit(all); } };
  } });
});

test('empty input is fed once to baseline, optional empty calls checked', async () => {
  const coverage = await assertChunkInvariant({ input: new Uint8Array(), createParser: collector });
  assert.equal(coverage.schedulesChecked, 1);
  assert.equal(coverage.allSingleCutsChecked, true);
});

test('emissions are snapshotted immediately and object key order is ignored', async () => {
  const result = await checkChunkInvariant({ input: bytes('abc'), ...compact, createParser: emit => {
    let writes = 0;
    return { write() { writes++; }, end() {
      const object = writes === 1 ? { a: [1], b: 2 } : { b: 2, a: [1] };
      emit(object); object.a[0] = 99;
    } };
  } });
  assert.equal(result.ok, true);
});

test('normalization supports rich events', async () => {
  await assertChunkInvariant({ input: bytes('x'), createParser: emit => ({ write() {}, end() { emit(new Date(0)); } }), normalizeEvent: date => date.toISOString() });
});

test('invalid event types and caught emission errors remain harness failures', async () => {
  for (const value of [undefined, NaN, Infinity, () => {}, new Date(), [, 1], { get nope() { throw Error('must not run'); } }]) {
    await assert.rejects(assertChunkInvariant({ input: bytes('x'), createParser: emit => ({ write() { try { emit(value); } catch {} } }) }), InvalidEventError);
  }
  const cycle = {}; cycle.self = cycle;
  await assert.rejects(assertChunkInvariant({ input: bytes('x'), createParser: emit => ({ write() { emit(cycle); } }) }), InvalidEventError);
});

test('baseline parser errors reject by default', async () => {
  await assert.rejects(assertChunkInvariant({ input: bytes('x'), createParser: () => ({ write() { throw new SyntaxError('bad'); } }) }), BaselineParserError);
});

test('explicit error comparison matches errors and emitted prefixes', async () => {
  await assertChunkInvariant({ input: bytes('abc'), ...compact, errorPolicy: 'compare', createParser: () => ({ write() {}, end() { throw new SyntaxError('bad'); } }) });
  const result = await checkChunkInvariant({ input: bytes('abc'), ...compact, errorPolicy: 'compare', createParser: emit => ({ write(c) { emit(c.length); throw Error('bad'); } }) });
  assert.equal(result.ok, false);
});

test('error comparison excludes stack and supports a custom projection', async () => {
  await assertChunkInvariant({ input: bytes('abc'), ...compact, errorPolicy: 'compare', createParser: () => ({ write() { throw { code: 'BAD', detail: Math.random() }; } }), normalizeError: error => ({ code: error.code }) });
});

test('candidate failure versus successful baseline is a mismatch', async () => {
  const result = await checkChunkInvariant({ input: bytes('abc'), ...compact, createParser: () => ({ write(c) { if (c.length === 1) throw Error('small'); } }) });
  assert.equal(result.ok, false);
  assert.equal(result.failure.actual.failed, true);
  assert.equal(result.failure.firstDifferentEvent, null);
});

test('baseline and failing schedule nondeterminism is not mislabeled as a chunk bug', async () => {
  let counter = 0;
  await assert.rejects(assertChunkInvariant({ input: bytes('abc'), createParser: emit => ({ write() {}, end() { emit(counter++); } }) }), NonDeterministicParserError);
  let variant = 0;
  await assert.rejects(assertChunkInvariant({ input: bytes('abc'), ...compact, createParser: emit => {
    let calls = 0;
    return { write() { calls++; }, end() { emit(calls === 1 ? 0 : ++variant); } };
  } }), NonDeterministicParserError);
});

test('budgets fail explicitly rather than returning a false pass', async () => {
  await assert.rejects(assertChunkInvariant({ input: bytes('abc'), createParser: quiet, maxRuns: 2 }), LimitExceededError);
  await assert.rejects(assertChunkInvariant({ input: bytes('abc'), createParser: quiet, maxCalls: 1 }), LimitExceededError);
  await assert.rejects(assertChunkInvariant({ input: bytes('abc'), createParser: quiet, maxInputBytes: 2 }), LimitExceededError);
  await assert.rejects(assertChunkInvariant({ input: bytes('x'), createParser: emit => ({ write() { emit('x'); } }), maxEvents: 0 }), LimitExceededError);
  await assert.rejects(assertChunkInvariant({ input: bytes('x'), createParser: emit => ({ write() { emit('long'); } }), maxOutputCharacters: 2 }), LimitExceededError);
});

test('hung async lifecycle operations time out and stop the check', async () => {
  for (const stage of ['factory', 'write', 'end']) {
    let created = 0;
    const never = () => new Promise(() => {});
    const createParser = () => {
      created++;
      if (stage === 'factory') return never();
      return { write: stage === 'write' ? never : () => {}, end: stage === 'end' ? never : () => {} };
    };
    await assert.rejects(assertChunkInvariant({ input: bytes('x'), createParser, timeoutMs: 10 }), ParserTimeoutError);
    assert.equal(created, 1);
  }
});

test('late asynchronous rejection after timeout does not become unhandled', async () => {
  await assert.rejects(assertChunkInvariant({ input: bytes('x'), timeoutMs: 5, createParser: () => ({ write: () => new Promise((_, reject) => setTimeout(() => reject(Error('late')), 15)) }) }), ParserTimeoutError);
  await new Promise(resolve => setTimeout(resolve, 25));
});

test('bounded shrink preserves a reproducible failure without promising completion', async () => {
  const result = await checkChunkInvariant({ input: bytes('abc'), createParser: emit => ({ write(c) { emit(c.length); } }), maxShrinkRuns: 0 });
  assert.equal(result.ok, false);
  assert.equal(result.failure.shrink.complete, false);
  assert.equal(result.failure.shrink.runs, 0);
  assert.equal((await replayChunkInvariant({ fixture: result.failure.fixture, createParser: emit => ({ write(c) { emit(c.length); } }) })).ok, false);
});

test('shrinker removes unnecessary cuts without modifying original bytes', async () => {
  const input = bytes('0123456789');
  const result = await checkChunkInvariant({ input, createParser: emit => {
    let position = 0;
    let bug = false;
    return { write(c) { position += c.length; if (position === 5) bug = true; }, end() { emit(bug); } };
  }, schedules: [[1, 1, 1, 1, 1, 1, 1, 1, 1, 1]], ...compact });
  assert.equal(result.ok, false);
  assert.deepEqual(result.failure.fixture.chunkSizes, [5, 5]);
  assert.equal(result.failure.fixture.inputHex, Buffer.from(input).toString('hex'));
});

test('schedule generation is seeded, unique, bounded and covers all single cuts when feasible', () => {
  const a = [...generateSchedules(30, { seed: 0 })];
  assert.deepEqual(a, [...generateSchedules(30, { seed: 0 })]);
  assert.notDeepEqual(a, [...generateSchedules(30, { seed: 1 })]);
  assert.equal(new Set(a.map(s => s.chunkSizes.join(','))).size, a.length);
  assert.equal(a.filter(s => s.kind === 'single-cut').length, 29);
  for (const length of [0, 1, 2, 12, 2000]) {
    for (const s of generateSchedules(length, { maxChunkCount: 20 })) {
      assert.equal(s.chunkSizes.reduce((a, b) => a + b, 0), length);
      assert.ok(s.chunkSizes.length <= 20);
      assert.ok(s.chunkSizes.every(n => Number.isInteger(n) && n >= 0));
    }
  }
});

test('bytewise overlap with a single-cut schedule is counted correctly', async () => {
  const coverage = await assertChunkInvariant({ input: bytes('ab'), createParser: collector });
  assert.equal(coverage.bytewiseChecked, true);
  assert.equal(coverage.singleCutsChecked, 1);
});

test('large input coverage reports its sampling honestly', async () => {
  const coverage = await assertChunkInvariant({ input: new Uint8Array(2000), createParser: quiet, maxSingleCuts: 3, randomCases: 1 });
  assert.equal(coverage.allSingleCutsChecked, false);
  assert.equal(coverage.bytewiseChecked, false);
});

test('custom schedules are validated and de-duplicated', async () => {
  const coverage = await assertChunkInvariant({ input: bytes('abc'), createParser: quiet, schedules: [[1, 2], [1, 2]], maxSingleCuts: 0, randomCases: 0, bytewise: false, emptyChunks: false });
  assert.equal(coverage.schedulesChecked, 1);
  for (const schedules of [[[]], [[2]], [[-1, 4]], [[1.5, 1.5]], [[4]], [[0, 0, 3]]]) {
    await assert.rejects(assertChunkInvariant({ input: bytes('abc'), createParser: quiet, schedules, maxChunkCount: 2 }), ConfigurationError);
  }
});

test('invalid options and fixtures reject before parser execution', async () => {
  for (const patch of [{ seed: NaN }, { maxRuns: 1 }, { stabilityRuns: 1 }, { bytewise: 1 }, { errorPolicy: 'skip' }, { input: 'x' }, { createParser: null }]) {
    await assert.rejects(assertChunkInvariant({ input: bytes('x'), createParser: quiet, ...patch }), ConfigurationError);
  }
  for (const fixture of [{ version: 2 }, { version: 1, inputHex: '0' }, { version: 1, inputHex: 'zz' }, { version: 1, inputHex: '00', chunkSizes: [2] }]) {
    await assert.rejects(replayChunkInvariant({ fixture, createParser: quiet }), ConfigurationError);
  }
});

test('no lost end-of-stream flush: end outputs are compared', async () => {
  const result = await checkChunkInvariant({ input: bytes('abc'), ...compact, createParser: emit => {
    let last;
    return { write(c) { last = c.length; }, end() { emit(last); } };
  } });
  assert.equal(result.ok, false);
});

test('slow synchronous throws cannot masquerade as comparable parser errors', async () => {
  await assert.rejects(assertChunkInvariant({
    input: bytes('x'), timeoutMs: 1, errorPolicy: 'compare',
    createParser: () => ({ write() { const until = performance.now() + 10; while (performance.now() < until) {} throw Error('late'); } }),
  }), ParserTimeoutError);
});

test('slow error normalization cannot return a false pass', async () => {
  await assert.rejects(assertChunkInvariant({
    input: bytes('x'), timeoutMs: 5, errorPolicy: 'compare',
    createParser: () => ({ write() { throw Error('bad'); } }),
    normalizeError(error) { const until = performance.now() + 20; while (performance.now() < until) {} return error.message; },
  }), ParserTimeoutError);
});

test('replay rejects missing or null metadata instead of silently substituting defaults', async () => {
  const fixture = { version: 1, inputHex: '00', chunkSizes: [1], seed: 1, errorPolicy: 'reject' };
  for (const patch of [{ seed: undefined }, { seed: null }, { errorPolicy: undefined }, { errorPolicy: null }]) {
    let called = false;
    await assert.rejects(replayChunkInvariant({ fixture: { ...fixture, ...patch }, createParser: () => { called = true; return quiet(); } }), ConfigurationError);
    assert.equal(called, false);
  }
});
