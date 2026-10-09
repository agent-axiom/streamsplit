/** Semantic outputs must be JSON data, or projected to it with normalizeEvent. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type MaybePromise<T> = T | PromiseLike<T>;

export interface ByteParser {
  write(chunk: Uint8Array): MaybePromise<void>;
  end?(): MaybePromise<void>;
}
export type ParserFactory<T> = (emit: (event: T) => void) => MaybePromise<ByteParser>;
export type ErrorPolicy = 'reject' | 'compare';

export interface ScheduleOptions {
  seed?: number;
  randomCases?: number;
  maxSingleCuts?: number;
  bytewise?: boolean;
  emptyChunks?: boolean;
  maxChunkCount?: number;
}
export interface CheckOptions<T> extends ScheduleOptions {
  input: Uint8Array;
  createParser: ParserFactory<T>;
  /** Additional exact schedules. Every size is an integer >= 0; the sum must match input.length. */
  schedules?: readonly (readonly number[])[];
  errorPolicy?: ErrorPolicy;
  normalizeEvent?: (event: T) => JsonValue;
  /** Used with errorPolicy: 'compare'; defaults to name/message, excluding stack. */
  normalizeError?: (error: unknown) => JsonValue;
  /** Stop checking/replay on cancellation. Does not forcibly cancel pending parser work. */
  signal?: AbortSignal;
  maxInputBytes?: number;
  maxRuns?: number;
  maxCalls?: number;
  maxEvents?: number;
  maxOutputCharacters?: number;
  /** Per parser run, including factory, write and end. Cannot interrupt blocked synchronous JS. */
  timeoutMs?: number;
  /** Repeats the baseline and any failing schedule. Must be >= 2. */
  stabilityRuns?: number;
  maxShrinkRuns?: number;
}
export interface Schedule {
  kind: 'single-cut' | 'bytewise' | 'random' | 'empty' | 'custom';
  chunkSizes: number[];
}
export interface Outcome {
  events: JsonValue[];
  error: JsonValue | null;
  failed: boolean;
}
export interface ReproFixture {
  version: 1;
  inputHex: string;
  chunkSizes: number[];
  seed: number;
  errorPolicy: ErrorPolicy;
}
export interface Coverage {
  inputBytes: number;
  seed: number;
  schedulesChecked: number;
  parserRuns: number;
  parserCalls: number;
  singleCutsChecked: number;
  allSingleCutsChecked: boolean;
  bytewiseChecked: boolean;
}
export interface Failure {
  baseline: Outcome;
  actual: Outcome;
  firstDifferentEvent: number | null;
  originalChunkSizes: number[];
  fixture: ReproFixture;
  shrink: { runs: number; complete: boolean };
}
export type CheckResult =
  | { ok: true; coverage: Coverage }
  | { ok: false; coverage: Coverage; failure: Failure };
