import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import {
  assertChunkInvariant, checkChunkInvariant, replayChunkInvariant,
  CheckAbortedError, ConfigurationError, ParserTimeoutError, StreamSplitError,
} from '../dist/index.js';

const input = new Uint8Array([1, 2, 3, 4]);
const quiet = () => ({ write() {} });
const fixture = { version: 1, inputHex: '01020304', chunkSizes: [2, 2], seed: 0, errorPolicy: 'compare' };
const compact = { randomCases: 0, maxSingleCuts: 0, bytewise: false, emptyChunks: false };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('pre-aborted check, assertion and replay do not invoke the parser or expose the abort reason', async () => {
  const reason = { secret: 'private-cancellation-reason', toString() { throw Error('must not inspect reason'); } };
  const signal = AbortSignal.abort(reason);
  let created = 0;
  const createParser = () => { created++; return quiet(); };
  for (const operation of [
    () => checkChunkInvariant({ input, createParser, signal }),
    () => assertChunkInvariant({ input, createParser, signal }),
    () => replayChunkInvariant({ fixture, createParser, signal }),
  ]) {
    await assert.rejects(operation(), error => {
      assert.ok(error instanceof CheckAbortedError);
      assert.ok(error instanceof StreamSplitError);
      assert.equal(error.name, 'CheckAbortedError');
      assert.equal('cause' in error, false);
      assert.equal('reason' in error, false);
      assert.doesNotMatch(error.message, /private-cancellation-reason/);
      return true;
    });
  }
  assert.equal(created, 0);
});

test('invalid cancellation signals reject before parser execution', async () => {
  for (const signal of [null, false, {}, { aborted: false }, new AbortController()]) {
    let created = false;
    await assert.rejects(checkChunkInvariant({ input, signal, createParser() { created = true; return quiet(); } }), ConfigurationError);
    assert.equal(created, false);
  }
});

test('cancels pending factory, write and end without starting another lifecycle call', async () => {
  for (const stage of ['factory', 'write', 'end']) {
    const controller = new AbortController();
    const started = deferred();
    const pending = deferred();
    const calls = [];
    const operation = name => { calls.push(name); if (name === stage) { started.resolve(); return pending.promise; } };
    const result = checkChunkInvariant({ input, signal: controller.signal, errorPolicy: 'compare', createParser() {
      if (stage === 'factory') return operation('factory');
      operation('factory');
      return { write() { return operation('write'); }, end() { return operation('end'); } };
    } });
    await started.promise;
    assert.equal(getEventListeners(controller.signal, 'abort').length, 1);
    controller.abort();
    await assert.rejects(result, CheckAbortedError);
    assert.deepEqual(calls, ['factory', 'write', 'end'].slice(0, ['factory', 'write', 'end'].indexOf(stage) + 1));
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
    // Settle abandoned work after rejection to verify the harness already detached.
    pending.resolve(quiet());
  }
});

test('abort before the queued factory microtask prevents parser execution', async () => {
  const controller = new AbortController();
  let created = 0;
  const result = checkChunkInvariant({ input, signal: controller.signal, createParser() { created++; return quiet(); } });
  controller.abort();
  await assert.rejects(result, CheckAbortedError);
  assert.equal(created, 0);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('synchronous lifecycle aborts cannot return success or become comparable parser failures', async () => {
  for (const stage of ['factory', 'write', 'end']) {
    for (const throws of [false, true]) {
      const controller = new AbortController();
      let created = 0;
      const operation = name => { if (stage === name) { controller.abort(); if (throws) throw Error('parser error'); } };
      await assert.rejects(checkChunkInvariant({ input, signal: controller.signal, errorPolicy: 'compare', createParser() {
        created++;
        operation('factory');
        return { write() { operation('write'); }, end() { operation('end'); } };
      } }), CheckAbortedError);
      assert.equal(created, 1);
      assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
    }
  }
});

test('cancellation from event or error normalization stays a harness cancellation', async () => {
  for (const hook of ['normalizeEvent', 'normalizeError']) {
    for (const throws of [false, true]) {
      const controller = new AbortController();
      const options = { input, signal: controller.signal, errorPolicy: 'compare', createParser: emit => ({ write() {
        if (hook === 'normalizeError') throw Error('parser error');
        try { emit('event'); } catch {} // A parser swallowing emit errors must not hide cancellation.
      } }), [hook]() {
        controller.abort();
        if (throws) throw Error('normalizer error');
        return null;
      } };
      await assert.rejects(checkChunkInvariant(options), CheckAbortedError);
      assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
    }
  }
});

test('cancellation stops boundary reduction instead of returning a partial failure', async () => {
  const controller = new AbortController();
  let created = 0;
  await assert.rejects(checkChunkInvariant({ input, ...compact, schedules: [[1, 1, 1, 1]], signal: controller.signal, createParser: emit => {
    created++;
    // Two baselines, two failing-schedule checks, baseline recheck, then reduction.
    if (created === 6) controller.abort();
    return { write(chunk) { emit(chunk.length); } };
  } }), CheckAbortedError);
  assert.equal(created, 6);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('replay forwards a live signal and cancels its exact candidate schedule', async () => {
  const controller = new AbortController();
  let created = 0;
  await assert.rejects(replayChunkInvariant({ fixture, signal: controller.signal, createParser() {
    created++;
    return { write(chunk) { if (chunk.length === 2) controller.abort(); } };
  } }), CheckAbortedError);
  assert.equal(created, 3);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('late parser emissions and rejection after cancellation are safely ignored or consumed', async () => {
  const controller = new AbortController();
  const started = deferred();
  const pending = deferred();
  let lateEmit;
  const result = checkChunkInvariant({ input, signal: controller.signal, createParser(emit) {
    lateEmit = emit;
    return { write() { started.resolve(); return pending.promise; } };
  } });
  await started.promise;
  controller.abort();
  assert.doesNotThrow(() => lateEmit(undefined)); // The abort rejection has not unwound the run yet.
  await assert.rejects(result, CheckAbortedError);
  assert.doesNotThrow(() => lateEmit(undefined));
  pending.reject(Error('late parser rejection'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('live signals preserve success and fixtures, with listeners cleaned on every exit', async () => {
  const controller = new AbortController();
  const listener = () => {};
  controller.signal.addEventListener('abort', listener);
  const options = { input, createParser: quiet };
  assert.deepEqual(await checkChunkInvariant({ ...options, signal: controller.signal }), await checkChunkInvariant(options));
  const broken = { input, createParser: emit => ({ write(chunk) { emit(chunk.length); } }) };
  assert.deepEqual(await checkChunkInvariant({ ...broken, signal: controller.signal }), await checkChunkInvariant(broken));
  await assert.rejects(checkChunkInvariant({ input, signal: controller.signal, createParser: () => null }), ConfigurationError);
  await assert.rejects(checkChunkInvariant({ input, signal: controller.signal, timeoutMs: 10, createParser: () => new Promise(() => {}) }), ParserTimeoutError);
  assert.deepEqual(getEventListeners(controller.signal, 'abort'), [listener]);
  controller.signal.removeEventListener('abort', listener);
});

test('normalizer cancellation does not throw from an asynchronous emitter callback', async () => {
  for (const throws of [false, true]) {
    const controller = new AbortController();
    const started = deferred();
    const pending = deferred();
    let emitEvent;
    const result = checkChunkInvariant({ input, signal: controller.signal, createParser(emit) {
      emitEvent = emit;
      return { write() { started.resolve(); return pending.promise; } };
    }, normalizeEvent() {
      controller.abort();
      if (throws) throw Error('private normalizer details');
      return null;
    } });
    await started.promise;
    assert.doesNotThrow(() => emitEvent('event'));
    await assert.rejects(result, error => {
      assert.ok(error instanceof CheckAbortedError);
      assert.equal('cause' in error, false);
      assert.doesNotMatch(JSON.stringify(error), /private normalizer details/);
      return true;
    });
    pending.resolve();
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  }
});

test('cancellation during final baseline microtasks cannot return a false pass', async () => {
  for (const depth of [3, 4]) {
    const controller = new AbortController();
    let runs = 0;
    await assert.rejects(checkChunkInvariant({ input, ...compact, signal: controller.signal, createParser() {
      runs++;
      return { write() {}, end() {
        if (runs === 2) {
          let remaining = depth;
          const tick = () => { if (remaining-- === 0) controller.abort(); else queueMicrotask(tick); };
          queueMicrotask(tick);
        }
      } };
    } }), CheckAbortedError);
    assert.equal(runs, 2);
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  }
});

test('error snapshot cancellation takes priority without leaking a thrown normalization error', async () => {
  const controller = new AbortController();
  await assert.rejects(checkChunkInvariant({ input, signal: controller.signal, errorPolicy: 'compare',
    createParser: () => ({ write() { throw Error('parser error'); } }),
    normalizeError: () => new Proxy({}, { ownKeys() { controller.abort(); throw Error('private snapshot details'); } }),
  }), error => {
    assert.ok(error instanceof CheckAbortedError);
    assert.equal('cause' in error, false);
    assert.doesNotMatch(error.message, /private snapshot details/);
    return true;
  });
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});
