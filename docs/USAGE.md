# Usage

[Home](../README.md) · [Usage](USAGE.md) · [API](API.md) · [Design](DESIGN.md) · [Safety](SAFETY.md)

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

Install the published package as a development dependency in your project:

```sh
npm install --save-dev @agent-axiom/streamsplit
```

The assertion below uses the package's public import and works outside this repository. The `examples/` directory and `example:*` commands belong to a source checkout; they are not included in the npm archive.

To try unreleased repository changes before publication, build and install a local archive:

```sh
# In this repository:
npm pack
# In your project, substituting the actual archive path:
npm install --save-dev /path/to/agent-axiom-streamsplit-0.1.0.tgz
```

The [20-second visual demo](assets/demo.gif) is rendered from real synthetic-fixture output. Reproduce the underlying checks with `npm run demo:short`; regenerate the optional animation with `npm run build && python3 scripts/render-demo.py` (Python/Pillow and DejaVu fonts required only for rendering).

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

