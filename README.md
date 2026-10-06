# StreamSplit

**Find streaming-parser bugs that only appear when bytes arrive in pieces.**

[![CI](https://github.com/agent-axiom/streamsplit/actions/workflows/ci.yml/badge.svg)](https://github.com/agent-axiom/streamsplit/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![Node](https://img.shields.io/badge/Node-%3E%3D20-339933?logo=nodedotjs&logoColor=white)](package.json)
[![Runtime dependencies](https://img.shields.io/badge/runtime_dependencies-0-brightgreen)](package.json)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[Usage](docs/USAGE.md) · [API](docs/API.md) · [Design](docs/DESIGN.md) · [Safety](docs/SAFETY.md) · [Contributing](CONTRIBUTING.md) · [For agents](AGENTS.md)

A read boundary is not a message boundary. Split a UTF-8 character, CRLF pair, JSON record, or SSE frame in the wrong place and a parser can silently change its output.

StreamSplit tests your existing parser in process, compares its ordered events, and returns a smaller failing partition with an exact replay fixture.

## Why StreamSplit

- **Real byte boundaries:** single-cut, bytewise, empty-read, and seeded random schedules
- **Observable behavior:** compare every emitted event, final flush, and configured error outcome
- **Reproducible failures:** repeat unstable outcomes, reduce boundaries, replay exact input bytes
- **Small footprint:** ESM + TypeScript, synchronous or asynchronous parsers, zero runtime dependencies

## Try it

```sh
git clone https://github.com/agent-axiom/streamsplit.git
cd streamsplit
npm ci
npm run demo
```

The demo catches a broken UTF-8 decoder in SSE, reproduces a two-chunk failure, then checks fixed SSE and NDJSON parsers.

## One assertion

From the built checkout, using the included NDJSON example:

```js
import { assertChunkInvariant } from './dist/index.js';
import { ndjsonParser } from './examples/parsers.mjs';

await assertChunkInvariant({
  input: new TextEncoder().encode('{"city":"東京"}\n{"emoji":"🌍"}\n'),
  createParser: ndjsonParser,
  seed: 42,
});
```

Return a **fresh parser on every factory call**. Emit complete semantic events and flush remaining output in `end()`. [Adapt your parser, install the tarball, and replay failures →](docs/USAGE.md)

## Know the limits

A pass covers the tested schedules, not every possible partition or protocol correctness. Reduction is bounded and does not claim a global minimum. Repeated runs guard against observed nondeterminism. Timeouts cannot interrupt blocked synchronous JavaScript. [Details →](docs/SAFETY.md)

Fixtures contain exact input bytes and may contain secrets. The runtime has no telemetry, network calls, or file access.

## Verify and install

`npm run check` runs regression tests, strict API type checks, and a clean packed-package consumer. CI covers Node 20, 22, and 24.

Not yet published to npm. Build an installable archive with `npm pack`; see [installation](docs/USAGE.md#try-it). Licensed under [MIT](LICENSE).
