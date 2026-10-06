import { BaselineParserError, ChunkInvariantError, ConfigurationError, InvalidEventError, LimitExceededError, NonDeterministicParserError, ParserTimeoutError, StreamSplitError } from './errors.js';
import { snapshot } from './json.js';
import { cutsToSizes, generateSchedules, integer, settings, sizesToCuts, validateSizes } from './schedules.js';
import type { CheckOptions, CheckResult, Coverage, JsonValue, Outcome, ReproFixture, Schedule } from './types.js';

export * from './types.js';
export * from './errors.js';
export { generateSchedules } from './schedules.js';

interface Recorded { outcome: Outcome; key: string }
const defaultError = (error: unknown): JsonValue => error instanceof Error
  ? { name: error.name, message: error.message }
  : { name: 'ThrownValue', value: String(error) };
const same = (a: Recorded, b: Recorded): boolean => a.key === b.key;

/** Check semantic event traces against the whole-buffer baseline. Never writes files or uses the network. */
export async function checkChunkInvariant<T>(options: CheckOptions<T>): Promise<CheckResult> {
  if (!options || !(options.input instanceof Uint8Array)) throw new ConfigurationError('input must be a Uint8Array.');
  if (typeof options.createParser !== 'function') throw new ConfigurationError('createParser must be a function.');
  const config = settings(options);
  const maxInputBytes = integer('maxInputBytes', options.maxInputBytes ?? 1048576, 0, 0x7fffffff);
  const maxRuns = integer('maxRuns', options.maxRuns ?? 512, 2, 1000000);
  const maxCalls = integer('maxCalls', options.maxCalls ?? 100000, 1, 100000000);
  const maxEvents = integer('maxEvents', options.maxEvents ?? 10000, 0, 1000000);
  const maxOutputCharacters = integer('maxOutputCharacters', options.maxOutputCharacters ?? 1048576, 1, 100000000);
  const timeoutMs = integer('timeoutMs', options.timeoutMs ?? 2000, 1, 2147483647);
  const stabilityRuns = integer('stabilityRuns', options.stabilityRuns ?? 2, 2, 100);
  const maxShrinkRuns = integer('maxShrinkRuns', options.maxShrinkRuns ?? 128, 0, 100000);
  const errorPolicy = options.errorPolicy ?? 'reject';
  if (errorPolicy !== 'reject' && errorPolicy !== 'compare') throw new ConfigurationError("errorPolicy must be 'reject' or 'compare'.");
  if (options.normalizeEvent !== undefined && typeof options.normalizeEvent !== 'function') throw new ConfigurationError('normalizeEvent must be a function.');
  if (options.normalizeError !== undefined && typeof options.normalizeError !== 'function') throw new ConfigurationError('normalizeError must be a function.');
  if (options.input.length > maxInputBytes) throw new LimitExceededError('input exceeds maxInputBytes.');
  if (options.schedules !== undefined && (!Array.isArray(options.schedules) || options.schedules.length > 10000)) throw new ConfigurationError('schedules must be an array with at most 10000 entries.');
  const input = new Uint8Array(options.input); // Caller changes and parser writes cannot corrupt the reference bytes.
  const custom = (options.schedules ?? []).map(sizes => validateSizes(sizes, input.length, config.maxChunkCount));
  const coverage: Coverage = {
    inputBytes: input.length, seed: config.seed, schedulesChecked: 0,
    parserRuns: 0, parserCalls: 0, singleCutsChecked: 0,
    allSingleCutsChecked: input.length <= 1, bytewiseChecked: input.length <= 1,
  };
  const run = async (sizes: readonly number[]): Promise<Recorded> => {
    if (coverage.parserRuns >= maxRuns) throw new LimitExceededError('maxRuns exhausted before the check completed. Increase maxRuns or reduce the requested schedules.');
    coverage.parserRuns++;
    const events: JsonValue[] = [];
    const keys: string[] = [];
    let characters = 0;
    let active = true;
    let emitFailure: StreamSplitError | undefined;
    const deadline = performance.now() + timeoutMs;
    const emit = (event: T): void => {
      if (!active) return; // No unhandled late-emission error after a rejected asynchronous operation.
      try {
        if (events.length >= maxEvents) throw new LimitExceededError('Parser emitted more than maxEvents.');
        let normalized: unknown = event;
        if (options.normalizeEvent) {
          try { normalized = options.normalizeEvent(event); }
          catch (cause) { throw new InvalidEventError('normalizeEvent threw an error.', { cause }); }
        }
        const copy = snapshot(normalized, maxOutputCharacters - characters);
        characters += copy.key.length;
        events.push(copy.value); keys.push(copy.key);
      } catch (error) {
        emitFailure = error instanceof StreamSplitError ? error : new InvalidEventError('Could not snapshot the emitted event.', { cause: error });
        throw emitFailure;
      }
    };
    const call = async <R>(operation: () => R | PromiseLike<R>): Promise<R> => {
      if (coverage.parserCalls >= maxCalls) throw new LimitExceededError('maxCalls exhausted before the check completed.');
      coverage.parserCalls++;
      const left = deadline - performance.now();
      if (left <= 0) throw new ParserTimeoutError('Parser run exceeded timeoutMs.');
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new ParserTimeoutError('Parser run exceeded timeoutMs. Pending parser work is not forcibly cancelled.')), Math.ceil(left));
          }),
          Promise.resolve().then(operation),
        ]);
        if (performance.now() > deadline) throw new ParserTimeoutError('Parser run exceeded timeoutMs. Synchronous JavaScript cannot be interrupted.');
        if (emitFailure) throw emitFailure;
        return result;
      } catch (error) {
        if (emitFailure) throw emitFailure;
        if (performance.now() > deadline && !(error instanceof ParserTimeoutError)) throw new ParserTimeoutError('Parser run exceeded timeoutMs. Synchronous JavaScript cannot be interrupted.');
        throw error;
      } finally { if (timer !== undefined) clearTimeout(timer); }
    };
    let failure: JsonValue | null = null;
    let failed = false;
    try {
      const parser = await call(() => options.createParser(emit));
      if (!parser || typeof parser.write !== 'function' || (parser.end !== undefined && typeof parser.end !== 'function')) throw new ConfigurationError('createParser must return an object with write() and optional end().');
      let offset = 0;
      for (const size of sizes) {
        const chunk = input.slice(offset, offset + size);
        offset += size;
        await call(() => parser.write(chunk));
      }
      if (parser.end) await call(() => parser.end!());
    } catch (error) {
      if (emitFailure) throw emitFailure;
      if (error instanceof StreamSplitError) throw error;
      failed = true;
      let normalized: unknown;
      try { normalized = (options.normalizeError ?? defaultError)(error); }
      catch (cause) { throw new InvalidEventError('normalizeError threw an error.', { cause }); }
      failure = snapshot(normalized, maxOutputCharacters - characters).value;
      if (performance.now() > deadline) throw new ParserTimeoutError('Parser run exceeded timeoutMs during error normalization.');
    } finally { active = false; }
    const outcome: Outcome = { events, error: failure, failed };
    return { outcome, key: JSON.stringify([keys, failed, failure]) };
  };
  const stable = async (sizes: readonly number[], initial?: Recorded): Promise<Recorded> => {
    const first = initial ?? await run(sizes);
    for (let repeat = 1; repeat < stabilityRuns; repeat++) {
      if (!same(first, await run(sizes))) throw new NonDeterministicParserError(sizes);
    }
    return first;
  };
  const baselineSizes = [input.length];
  const baseline = await stable(baselineSizes);
  if (baseline.outcome.failed && errorPolicy === 'reject') throw new BaselineParserError(baseline.outcome);
  const seen = new Set<string>([String(input.length)]);
  function* schedules(): Generator<Schedule> {
    for (const chunkSizes of custom) yield { kind: 'custom', chunkSizes };
    yield* generateSchedules(input.length, config);
  }
  for (const schedule of schedules()) {
    const scheduleKey = schedule.chunkSizes.join(',');
    if (seen.has(scheduleKey)) continue;
    seen.add(scheduleKey);
    const actual = await run(schedule.chunkSizes);
    coverage.schedulesChecked++;
    if (schedule.chunkSizes.length === 2 && schedule.chunkSizes.every(size => size > 0)) coverage.singleCutsChecked++;
    if (schedule.chunkSizes.length === input.length && schedule.chunkSizes.every(size => size === 1)) coverage.bytewiseChecked = true;
    coverage.allSingleCutsChecked = coverage.singleCutsChecked === Math.max(0, input.length - 1);
    if (same(baseline, actual)) continue;
    await stable(schedule.chunkSizes, actual);
    if (!same(baseline, await run(baselineSizes))) throw new NonDeterministicParserError(baselineSizes);
    let best = actual;
    let cuts = sizesToCuts(schedule.chunkSizes);
    let granularity = 2;
    let shrinkRuns = 0;
    let complete = cuts.length === 0;
    reduction: while (cuts.length > 0) {
      const width = Math.ceil(cuts.length / granularity);
      for (let start = 0; start < cuts.length; start += width) {
        // Reserve repeat capacity before trying a candidate. Limits yield an honest partial reduction.
        if (shrinkRuns + stabilityRuns > maxShrinkRuns || coverage.parserRuns + stabilityRuns > maxRuns) break reduction;
        const candidateCuts = cuts.slice(0, start).concat(cuts.slice(start + width));
        const sizes = cutsToSizes(candidateCuts, input.length);
        // Reserve enough lifecycle calls for this attempt and its stability check.
        if (coverage.parserCalls + stabilityRuns * (sizes.length + 2) > maxCalls) break reduction;
        const candidate = await run(sizes); shrinkRuns++;
        if (!same(baseline, candidate)) {
          if (candidateCuts.length === 0) throw new NonDeterministicParserError(baselineSizes);
          for (let repeat = 1; repeat < stabilityRuns; repeat++) {
            const repeated = await run(sizes); shrinkRuns++;
            if (!same(candidate, repeated)) throw new NonDeterministicParserError(sizes);
          }
          cuts = candidateCuts; best = candidate; granularity = Math.max(2, granularity - 1);
          continue reduction;
        }
      }
      if (granularity >= cuts.length) { complete = true; break; }
      granularity = Math.min(cuts.length, granularity * 2);
    }
    const actualEvents = best.outcome.events;
    const baselineEvents = baseline.outcome.events;
    let firstDifferentEvent: number | null = null;
    for (let index = 0; index < Math.max(actualEvents.length, baselineEvents.length); index++) {
      if (JSON.stringify(actualEvents[index]) !== JSON.stringify(baselineEvents[index])) { firstDifferentEvent = index; break; }
    }
    const fixture: ReproFixture = {
      version: 1,
      inputHex: Array.from(input, byte => byte.toString(16).padStart(2, '0')).join(''),
      chunkSizes: cutsToSizes(cuts, input.length), seed: config.seed, errorPolicy,
    };
    return { ok: false, coverage, failure: {
      baseline: baseline.outcome, actual: best.outcome, firstDifferentEvent,
      originalChunkSizes: schedule.chunkSizes, fixture,
      shrink: { runs: shrinkRuns, complete },
    } };
  }
  return { ok: true, coverage };
}

/** Throw a typed, payload-redacted assertion error on a confirmed chunk-dependent outcome. */
export async function assertChunkInvariant<T>(options: CheckOptions<T>): Promise<Coverage> {
  const result = await checkChunkInvariant(options);
  if (!result.ok) throw new ChunkInvariantError(result.failure, result.coverage);
  return result.coverage;
}

export interface ReplayOptions<T> extends Pick<CheckOptions<T>, 'createParser' | 'normalizeEvent' | 'normalizeError' | 'timeoutMs' | 'stabilityRuns' | 'maxInputBytes' | 'maxEvents' | 'maxOutputCharacters' | 'maxCalls' | 'maxRuns'> {
  fixture: ReproFixture;
}
/** Replay the exact bytes/schedule; a failure result confirms reproduction. Reuse your normalization hooks. */
export async function replayChunkInvariant<T>(options: ReplayOptions<T>): Promise<CheckResult> {
  const fixture = options.fixture;
  if (!fixture || fixture.version !== 1 || typeof fixture.inputHex !== 'string' || !/^(?:[0-9a-f]{2})*$/i.test(fixture.inputHex)) throw new ConfigurationError('Invalid version-1 StreamSplit fixture.');
  integer('fixture.seed', fixture.seed, 0, 0xffffffff);
  if (fixture.errorPolicy !== 'reject' && fixture.errorPolicy !== 'compare') throw new ConfigurationError('Fixture errorPolicy must be reject or compare.');
  const byteLength = fixture.inputHex.length / 2;
  const maxInputBytes = integer('maxInputBytes', options.maxInputBytes ?? 1048576, 0, 0x7fffffff);
  if (byteLength > maxInputBytes) throw new LimitExceededError('Fixture exceeds maxInputBytes.');
  const sizes = validateSizes(fixture.chunkSizes, byteLength, 65536);
  const input = new Uint8Array(byteLength);
  for (let index = 0; index < byteLength; index++) input[index] = Number.parseInt(fixture.inputHex.slice(index * 2, index * 2 + 2), 16);
  return checkChunkInvariant({ ...options, input, seed: fixture.seed, errorPolicy: fixture.errorPolicy,
    schedules: [sizes], maxSingleCuts: 0, randomCases: 0, bytewise: false, emptyChunks: false,
    maxChunkCount: Math.max(1, sizes.length), maxShrinkRuns: 0,
  });
}
