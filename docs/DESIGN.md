# Design

[Home](../README.md) · [Usage](USAGE.md) · [API](API.md) · [Design](DESIGN.md) · [Safety](SAFETY.md)

## What gets checked

1. Parse the complete byte fixture in one write. Repeat it to guard against nondeterminism.
2. Try single-cut partitions, one-byte reads when within the chunk cap, explicit empty reads, and seeded random partitions.
3. Compare the entire ordered event trace and the configured error outcome against the baseline.
4. Confirm a mismatch by repeating its exact schedule and rechecking the baseline.
5. Try removing groups of chunk boundaries, retaining a smaller partition only when it still fails reproducibly.

Input bytes are copied before checking and every delivered chunk has its own copy. A parser that mutates its chunk cannot corrupt subsequent runs. Event values are snapshotted when emitted, so later mutation cannot rewrite history.

A pass means the **tested schedules** agreed. It does not prove correctness, exhaust every possible partition, validate the protocol, or guarantee determinism. A parser that is consistently wrong can pass. Keep ordinary expected-output tests alongside this assertion.

## Design and verification

- `src/schedules.ts`: validated, deterministic, byte-oriented partition generation
- `src/json.ts`: bounded canonical JSON snapshots
- `src/index.ts`: sequential execution, comparison, stability guards, reduction, replay
- `src/types.ts` / `src/errors.ts`: explicit contracts and typed failure categories
- `examples/`: broken/fixed UTF-8 SSE and NDJSON adapters

`npm run check` builds strict TypeScript, runs unit/regression tests, checks API types, packs the package, installs that archive into a clean temporary consumer, and verifies ESM execution plus TypeScript resolution. CI runs the same checks and demo on Node 20, 22, and 24. Runtime imports use standard JavaScript/Web APIs; Node is the currently tested support target.

The focused scope is intentional. A network fault proxy can exercise a live system, and a property-testing framework can generate arbitrary inputs. StreamSplit provides the narrow in-process assertion, stability checks, bounded boundary reduction, and fixture replay for one byte-stream invariant. It does not replace either tool.


## Reduction contract

Only partition boundaries change. A bounded delta-reduction pass removes groups of boundaries and then tests individual removals. Every accepted mismatch is repeated. Input bytes stay exact; no global minimum or globally optimal partition is claimed. The reducer may retain a different mismatch from the initial failure. A partial reduction still returns the last confirmed fixture with `shrink.complete: false`.

## Reproducibility contract

The PRNG algorithm is fixed (Mulberry32), including seed zero. The factory is called afresh for every run. Baseline repeats and failing-schedule repeats guard against observed nondeterminism, but do not prove its absence. Caller I/O, clocks, randomness, shared global state, and background emissions remain the caller's responsibility.

## Package contract

The package is ESM-only, targets Node 20+, and ships strict TypeScript declarations with source maps. It has no runtime dependencies. Building uses a pinned TypeScript development dependency. `npm run check` installs the actual packed tarball into a temporary consumer, rather than assuming that source-checkout imports prove packaging works.
