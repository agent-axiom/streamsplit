# Agent guide

StreamSplit is a small in-process byte-chunk invariance test helper. Read only the sections relevant to your task.

## Navigation

| Task | Start here |
| --- | --- |
| Adapt a streaming parser or replay a fixture | [docs/USAGE.md](docs/USAGE.md), [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md) |
| Prepare a release candidate without publishing | [docs/RELEASING.md](docs/RELEASING.md) |
| Change options, outputs, comparison, or error behavior | [docs/API.md](docs/API.md), [src/types.ts](src/types.ts) |
| Change execution, schedules, or reduction | [docs/DESIGN.md](docs/DESIGN.md), [src/index.ts](src/index.ts), [src/schedules.ts](src/schedules.ts) |
| Handle private fixtures, bounds, or timeouts | [docs/SAFETY.md](docs/SAFETY.md) |
| Add a regression or modify packaging | [CONTRIBUTING.md](CONTRIBUTING.md), [test/](test/), [scripts/test-package.mjs](scripts/test-package.mjs) |

## Commands

- Setup: `npm ci`
- Full verification: `npm run check`
- Realistic broken/fixed examples: `npm run demo`
- Build package archive: `npm pack`
- Full release-candidate check: `npm run release:check`

## Preserve these contracts

- A fresh parser factory for every run; no shared mutable parser state.
- Byte-oriented partitions and exact original input in replay fixtures.
- Ordered semantic event comparison, immediate snapshots, and explicit error policy.
- Deterministic seeded schedules; repeated baseline/failure checks before attributing a chunk bug.
- Bounded calls/runs/output/reduction. Exhaustion during checking must never return a partial pass.
- No claim that timeouts interrupt blocked synchronous JavaScript or that shrinking finds a global minimum.
- No runtime dependencies, telemetry, network/file access, dynamic module loading, or parser source execution.
- No secrets in fixtures, issue reports, or logs; fixtures preserve exact bytes.

Keep README short. Put deeper reference material in the linked Markdown files. Add deterministic regression coverage, then run the full verification command and demo before marking a change complete. Do not publish the npm package without explicit maintainer authorization.
