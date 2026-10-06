# API reference

[Home](../README.md) · [Usage](USAGE.md) · [API](API.md) · [Design](DESIGN.md) · [Safety](SAFETY.md)

## Entry points

- `assertChunkInvariant(options): Promise<Coverage>` resolves on agreement, throws `ChunkInvariantError` on a confirmed mismatch.
- `checkChunkInvariant(options): Promise<CheckResult>` returns `{ok: true, coverage}` or `{ok: false, coverage, failure}`. Harness/configuration failures still throw.
- `replayChunkInvariant({fixture, createParser, ...limits}): Promise<CheckResult>` compares the exact saved partition to a fresh whole-buffer baseline.
- `generateSchedules(inputLength, options): Generator<Schedule>` exposes seeded partition generation without running a parser.

All offsets and sizes are bytes. `createParser(emit)` must return a new object with `write(chunk: Uint8Array)` and optional `end()`. The factory and both methods may be synchronous or return a promise; operations are awaited in sequence. Emit semantic records before an operation completes, and flush buffered output in `end()`.

## Failure categories

- `ChunkInvariantError`: confirmed difference; inspect `failure` and `coverage`.
- `BaselineParserError`: whole-buffer parser failed under the default reject policy.
- `NonDeterministicParserError`: repeated identical schedules produced different outcomes.
- `ConfigurationError`: invalid options, factory contract, schedules, or replay schema.
- `LimitExceededError`: input/output/execution budget exceeded.
- `ParserTimeoutError`: elapsed per-run deadline exceeded.
- `InvalidEventError`: unsupported output or normalization failure.

These extend `StreamSplitError`. Keep harness failures separate from parser failures. All public types ship in the package declarations.

## Events and errors

By default, events must be finite JSON data: strings, numbers, booleans, null, dense arrays, and plain objects. Object key order does not matter; array and event order do. `-0` and `0` compare alike. Cycles, undefined, sparse arrays, accessors, symbols, class instances, and non-finite numbers are rejected instead of being silently dropped. Nesting is limited to 64 levels.

For dates, typed arrays, class instances, or irrelevant timestamps, project each emitted event explicitly:

```ts
await assertChunkInvariant({
  input,
  createParser,
  normalizeEvent: event => ({ type: event.type, bytes: Array.from(event.bytes) }),
});
```

Projection controls what is compared. Do not normalize away fields whose chunk invariance you need to test.

The default `errorPolicy: 'reject'` requires a successful whole-buffer baseline. If that baseline fails, `BaselineParserError` stops the check. A candidate failure against a successful baseline is always a mismatch.

For deliberately invalid fixtures, opt into `errorPolicy: 'compare'`. Outcomes must then match both the emitted prefix and the error. Errors default to `{name, message}`; stacks and lifecycle stage are not compared. Other thrown values default to their string representation. Supply `normalizeError(error)` if your parser needs a different equivalence rule, for example a stable error code. A timeout, invalid event, or exhausted harness budget is never accepted as an equivalent parser error.

## Controls and honest coverage

| Option | Default | Meaning |
| --- | ---: | --- |
| `seed` | `24301` (`0x5eed`) | Unsigned 32-bit seed; zero is valid |
| `randomCases` | `64` | Random generation attempts; duplicate schedules are skipped |
| `maxSingleCuts` | `128` | All single cuts up to this cap, otherwise evenly sampled byte offsets |
| `bytewise` | `true` | One-byte reads when input length fits `maxChunkCount` |
| `emptyChunks` | `true` | Leading/trailing and interspersed zero-byte reads when the chunk cap permits |
| `maxChunkCount` | `1024` | Chunks per schedule |
| `schedules` | `[]` | Additional exact chunk-size arrays, tried first |
| `stabilityRuns` | `2` | Baseline and failing-schedule repeats; minimum two |
| `maxShrinkRuns` | `128` | Parser runs available to boundary reduction |
| `maxRuns` | `512` | Total parser runs, including repeats and reduction |
| `maxCalls` | `100000` | Total factory/write/end calls |
| `maxInputBytes` | `1048576` | Fixture size cap before the input copy |
| `maxEvents` | `10000` | Emitted events per run |
| `maxOutputCharacters` | `1048576` | Canonical JSON characters per run, including normalized errors |
| `timeoutMs` | `2000` | Elapsed deadline for each parser run |

A schedule's nonnegative integer sizes must sum to the exact byte length. Sizes of zero call `write(new Uint8Array())`. Empty input gets one empty baseline write. Custom and generated schedules are deduplicated, and the baseline is not retested as a candidate.

Coverage reports the seed, bytes, schedules checked, parser runs/calls, number of single cuts actually checked, `allSingleCutsChecked`, and `bytewiseChecked`. A failure's coverage reflects work up to that failure, including reduction calls. Reaching an execution budget during normal checking throws `LimitExceededError`; it never returns a partial pass. Setting all schedule generators off is allowed, but only checks baseline stability unless you supply custom schedules.

`generateSchedules(inputLength, options)` exposes the deterministic schedule generator for inspection. Generated partitions vary small-read and broader-read scales; they are not a uniform sample of all possible partitions. Empty-chunk testing is a documented stress case; set `emptyChunks: false` if your adapter deliberately excludes it.

