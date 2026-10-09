import type { Coverage, Failure, Outcome } from './types.js';

export class StreamSplitError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}
export class ConfigurationError extends StreamSplitError {}
export class LimitExceededError extends StreamSplitError {}
export class ParserTimeoutError extends StreamSplitError {}
export class CheckAbortedError extends StreamSplitError {
  constructor() {
    super('StreamSplit check was aborted. Pending parser work is not forcibly cancelled.');
  }
}
export class InvalidEventError extends StreamSplitError {}
export class NonDeterministicParserError extends StreamSplitError {
  constructor(readonly chunkSizes: readonly number[]) {
    super('The same bytes and chunk schedule produced different outcomes. Make the parser factory deterministic and independent before comparing chunk schedules.');
  }
}
export class BaselineParserError extends StreamSplitError {
  constructor(readonly outcome: Outcome) {
    super("The whole-buffer baseline failed. Fix the fixture or use errorPolicy: 'compare' to test invalid input.");
  }
}
export class ChunkInvariantError extends StreamSplitError {
  constructor(readonly failure: Failure, readonly coverage: Coverage) {
    super(`Chunk-dependent parser outcome for ${coverage.inputBytes} bytes (seed ${coverage.seed}, ${failure.fixture.chunkSizes.length} chunks). Replay error.failure.fixture; it contains the original input bytes.`);
  }
}
