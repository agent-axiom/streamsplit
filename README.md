# StreamSplit

**Your parser should produce the same events, however the bytes arrive.**

StreamSplit finds byte-chunking bugs in streaming parsers, reduces failing partitions, and gives you an exact fixture to replay in a regression test.

[![CI](https://github.com/agent-axiom/streamsplit/actions/workflows/ci.yml/badge.svg)](https://github.com/agent-axiom/streamsplit/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

```text
Same UTF-8 bytes:     data: Hello 🌍\r\n\r\n
Whole-buffer output: { data: "Hello 🌍" }
Split inside 🌍:      { data: "Hello ����" }
                     ^ StreamSplit catches this and saves the split
```

A read boundary is not a message boundary. UTF-8 code points, CRLF pairs, JSON records, and SSE frames can all straddle reads. Happy-path fixtures often hide these mistakes because they arrive in one convenient buffer.

StreamSplit exercises your existing parser **in process**. It compares the ordered semantic events it emits, not merely the final concatenated text. It is a small test helper, not a parser, network proxy, protocol implementation, or fuzzing platform.

## Try it

Node.js 20+ and npm. ESM, strict TypeScript declarations, zero runtime dependencies.

```sh
git clone https://github.com/agent-axiom/streamsplit.git
cd streamsplit
npm ci
npm run demo
npm run check
```

The demo detects a broken UTF-8 decoder, reduces the failure to two chunks, replays it, and checks the fixed SSE and NDJSON versions. The example parsers are intentionally small and are not production protocol implementations.

This package is **not published to the npm registry yet**. To use the verified package in another project:

```sh
# In this repository:
npm pack
# In your project, substituting the actual archive path:
npm install --save-dev /path/to/agent-axiom-streamsplit-0.1.0.tgz
```

## One assertion

Adapt your parser once. Return a **new, independent parser for every call** to the factory. Emit one value per semantic record, with all final buffered output flushed in `end()`.

```ts
import { assertChunkInvariant } from '@agent-axiom/streamsplit';

await assertChunkInvariant({
  input: new TextEncoder().encode('{"city":"東京"}\n{"emoji":"🌍"}\n'),
  createParser(emit) {
    const decoder = new TextDecoder();
    let pending = '';

    function consume(text: string) {
      pending += text;
      let newline: number;
      while ((newline = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        if (line) emit(JSON.parse(line));
      }
    }

    return {
      write(chunk) {
        // Removing stream: true creates a real bug that this assertion catches.
        consume(decoder.decode(chunk, { stream: true }));
      },
      end() {
        consume(decoder.decode());
        if (pending.trim()) emit(JSON.parse(pending));
      },
    };
  },
});
```

Use it inside `node:test`, Vitest, Jest, or any runner that awaits promises. Both synchronous and asynchronous factories, `write()` methods, and `end()` methods are supported; the assertion itself always returns a promise. Operations are awaited sequentially. A parser must finish its emissions before its awaited operation completes. Background emissions after the run ends are ignored.

## What gets checked

1. Parse the complete byte fixture in one write. Repeat it to guard against nondeterminism.
2. Try single-cut partitions, one-byte reads when within the chunk cap, explicit empty reads, and seeded random partitions.
3. Compare the entire ordered event trace and the configured error outcome against the baseline.
4. Confirm a mismatch by repeating its exact schedule and rechecking the baseline.
5. Try removing groups of chunk boundaries, retaining a smaller partition only when it still fails reproducibly.

Input bytes are copied before checking and every delivered chunk has its own copy. A parser that mutates its chunk cannot corrupt subsequent runs. Event values are snapshotted when emitted, so later mutation cannot rewrite history.

A pass means the **tested schedules** agreed. It does not prove correctness, exhaust every possible partition, validate the protocol, or guarantee determinism. A parser that is consistently wrong can pass. Keep ordinary expected-output tests alongside this assertion.

## Failures you can replay

`assertChunkInvariant()` returns coverage on success and throws `ChunkInvariantError` for a confirmed mismatch. Use `checkChunkInvariant()` for a discriminated result instead:

```ts
import { checkChunkInvariant, replayChunkInvariant } from '@agent-axiom/streamsplit';

const result = await checkChunkInvariant({ input, createParser, seed: 42 });
if (!result.ok) {
  const { fixture, originalChunkSizes, shrink } = result.failure;
  // fixture is plain JSON: version, exact inputHex, chunkSizes, seed, errorPolicy.
  const savedFixture = JSON.parse(JSON.stringify(fixture));
  const replay = await replayChunkInvariant({
    fixture: savedFixture,
    createParser,
  });
  // replay.ok === false confirms this exact fixture still reproduces.
}
```

The failure also includes baseline/actual outcomes and `firstDifferentEvent` (zero-based; `null` when only the error differs). A replay tests the saved partition against the whole-buffer baseline; it does not launch another randomized search or reduction. Pass the same normalization hooks when replaying.

**Reduction is bounded and only changes boundaries.** It never deletes, reorders, or changes input bytes. `shrink.complete` means the boundary-removal pass reached a fixed point under its test strategy; it is not a claim of a globally smallest failure. When its run budget or remaining check budget runs out, the already-confirmed fixture is returned with `complete: false`. The reducer may retain a different chunk-dependent mismatch from the initial one.

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

## Timeouts, isolation, and privacy

A timeout can reject a pending asynchronous operation and stops the check. It cannot forcibly cancel that operation, interrupt synchronously blocked JavaScript, or defeat microtask starvation. A synchronous operation that eventually returns or throws after the deadline is reported as a timeout. Use worker/process isolation for untrusted or potentially nonterminating parsers.

The factory, parser methods, and normalization hooks are caller-provided trusted code. StreamSplit is not a sandbox. Bounds constrain the harness; they do not bound arbitrary allocations or work inside the parser. A fixed seed reproduces schedules, not external I/O, random application state, or time-dependent behavior.

There is no telemetry, network access, file access, dynamic module loading, or logging in the runtime library. It runs only the parser and hooks supplied by the caller. **Fixtures contain exact input bytes, and failure objects contain emitted values/errors.** They can hold secrets. Keep sensitive fixtures out of public issue reports and CI logs. The default assertion message omits payload values; inspect failure objects intentionally.

## Design and verification

- `src/schedules.ts`: validated, deterministic, byte-oriented partition generation
- `src/json.ts`: bounded canonical JSON snapshots
- `src/index.ts`: sequential execution, comparison, stability guards, reduction, replay
- `src/types.ts` / `src/errors.ts`: explicit contracts and typed failure categories
- `examples/`: broken/fixed UTF-8 SSE and NDJSON adapters

`npm run check` builds strict TypeScript, runs unit/regression tests, checks API types, packs the package, installs that archive into a clean temporary consumer, and verifies ESM execution plus TypeScript resolution. CI runs the same checks and demo on Node 20, 22, and 24. Runtime imports use standard JavaScript/Web APIs; Node is the currently tested support target.

The focused scope is intentional. A network fault proxy can exercise a live system, and a property-testing framework can generate arbitrary inputs. StreamSplit provides the narrow in-process assertion, stability checks, bounded boundary reduction, and fixture replay for one byte-stream invariant. It does not replace either tool.

See [CONTRIBUTING.md](CONTRIBUTING.md). Licensed under [MIT](LICENSE).
