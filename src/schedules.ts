import { ConfigurationError } from './errors.js';
import type { Schedule, ScheduleOptions } from './types.js';

export function integer(name: string, value: number, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new ConfigurationError(`${name} must be an integer from ${min} to ${max}.`);
  return value;
}
export function settings(options: ScheduleOptions) {
  for (const key of ['bytewise', 'emptyChunks'] as const) {
    if (options[key] !== undefined && typeof options[key] !== 'boolean') throw new ConfigurationError(`${key} must be a boolean.`);
  }
  return {
    seed: integer('seed', options.seed ?? 0x5eed, 0, 0xffffffff),
    randomCases: integer('randomCases', options.randomCases ?? 64, 0, 10000),
    maxSingleCuts: integer('maxSingleCuts', options.maxSingleCuts ?? 128, 0, 10000),
    maxChunkCount: integer('maxChunkCount', options.maxChunkCount ?? 1024, 1, 65536),
    bytewise: options.bytewise ?? true,
    emptyChunks: options.emptyChunks ?? true,
  };
}
/** All offsets are byte offsets. Seed 0 is valid. No Math.random or global state. */
export function* generateSchedules(inputLength: number, options: ScheduleOptions = {}): Generator<Schedule> {
  integer('inputLength', inputLength, 0, 0x7fffffff);
  const config = settings(options);
  const seen = new Set<string>([String(inputLength)]);
  const offer = (kind: Schedule['kind'], chunkSizes: number[]): Schedule | undefined => {
    const key = chunkSizes.join(',');
    if (seen.has(key)) return;
    seen.add(key);
    return { kind, chunkSizes };
  };
  if (config.maxChunkCount >= 2) {
    const count = Math.min(inputLength - 1, config.maxSingleCuts);
    for (let index = 0; index < count; index++) {
      const cut = count === inputLength - 1 ? index + 1 : 1 + Math.floor(index * (inputLength - 2) / Math.max(1, count - 1));
      const schedule = offer('single-cut', [cut, inputLength - cut]);
      if (schedule) yield schedule;
    }
  }
  if (config.bytewise && inputLength > 1 && inputLength <= config.maxChunkCount) {
    const schedule = offer('bytewise', Array<number>(inputLength).fill(1));
    if (schedule) yield schedule;
  }
  if (config.emptyChunks && config.maxChunkCount >= 3) {
    const schedule = offer('empty', [0, inputLength, 0]);
    if (schedule) yield schedule;
    if (inputLength > 1 && config.maxChunkCount >= 4) {
      const middle = Math.floor(inputLength / 2);
      const interspersed = offer('empty', [middle, 0, inputLength - middle, 0]);
      if (interspersed) yield interspersed;
    }
  }
  // Mulberry32: fixed algorithm, stable across JS runtimes.
  let state = config.seed;
  const random = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  for (let trial = 0; trial < config.randomCases && inputLength > 1 && config.maxChunkCount > 1; trial++) {
    const sizes: number[] = [];
    let left = inputLength;
    // Vary scale: tiny reads and broad random partitions find different defects.
    const width = 1 + Math.floor(random() * Math.min(inputLength, trial % 2 ? 64 : inputLength));
    while (left > 0 && sizes.length < config.maxChunkCount - 1) {
      const size = Math.min(left, 1 + Math.floor(random() * width));
      sizes.push(size); left -= size;
    }
    if (left) sizes.push(left);
    const schedule = offer('random', sizes);
    if (schedule) yield schedule;
  }
}
export function validateSizes(sizes: readonly number[], inputLength: number, maxChunkCount: number): number[] {
  if (!Array.isArray(sizes) || sizes.length === 0 || sizes.length > maxChunkCount) throw new ConfigurationError('A chunk schedule must be a nonempty array within maxChunkCount.');
  let sum = 0;
  for (const size of sizes) sum += integer('chunk size', size, 0, inputLength);
  if (sum !== inputLength) throw new ConfigurationError('Chunk sizes must sum exactly to input.length.');
  return [...sizes];
}
export function cutsToSizes(cuts: readonly number[], length: number): number[] {
  let previous = 0;
  const sizes = cuts.map(cut => { const size = cut - previous; previous = cut; return size; });
  sizes.push(length - previous);
  return sizes;
}
export function sizesToCuts(sizes: readonly number[]): number[] {
  let position = 0;
  return sizes.slice(0, -1).map(size => position += size);
}
