# Integration recipes

[Home](../README.md) · [Usage](USAGE.md) · [API](API.md) · [Safety](SAFETY.md)

These are compatibility tests maintained in this repository, not claims of adoption or endorsement by upstream projects. Both packages are development-only dependencies; StreamSplit's published runtime still has none.

## Verified targets

| Parser | Test target | Lifecycle |
| --- | --- | --- |
| [eventsource-parser](https://github.com/rexxars/eventsource-parser) | 3.0.6 on Node 20/22/24 | `createParser({onEvent})`, `feed(text)`, `reset({consume: true})` |
| [eventsource-parser](https://github.com/rexxars/eventsource-parser) | 4.1.1 on Node 22 | Same adapter; v4 requires Node >=22.12 |
| [ndjson](https://github.com/ndjson/ndjson.js) | 2.0.0 on Node 20/22/24 | Transform stream, awaited writes, readable completion |

Versions are pinned in `package-lock.json` and the explicit v4 CI job. Current-source APIs and supported engines are documented by [eventsource-parser](https://github.com/rexxars/eventsource-parser/blob/main/package.json) and [ndjson](https://github.com/ndjson/ndjson.js/blob/master/package.json). This is fixture-specific compatibility evidence, not a conformance suite for either project.

```sh
npm ci
npm run test:integrations
```

To repeat the v4 check on Node 22.12 or newer:

```sh
npm install --no-save --package-lock=false --ignore-scripts eventsource-parser@4.1.1
npm run test:integrations
npm ci  # Restore the locked development dependency versions.
```

## SSE: streaming text decoding belongs in the adapter

[Complete adapter source](https://github.com/agent-axiom/streamsplit/blob/main/examples/integrations/eventsource.mjs)

Create one TextDecoder and one eventsource-parser instance per factory call. Use `decoder.decode(chunk, {stream: true})` for every write, then feed `decoder.decode()` and call `reset({consume: true})` at end. Preserve event boundaries: each `onEvent` callback emits one record. Map optional undefined `id` and `event` fields explicitly to JSON null; preserve empty strings.

The tests check expected data, event types, IDs, comments, retry values, multiline payloads, mixed CRLF/LF, Unicode, and unfinished EOF data. An intentionally broken non-streaming decoder produces a two-chunk UTF-8 failure. The fixed adapter passes replay of that exact fixture.

## NDJSON: await the actual Transform lifecycle

[Complete adapter source](https://github.com/agent-axiom/streamsplit/blob/main/examples/integrations/ndjson.mjs)

Feed byte chunks directly to `ndjson.parse()`. Its decoder handles UTF-8. Await each write callback and the readable `end` event, capture stream errors, and propagate any harness emission failure rather than swallowing it in the data listener. Do not resolve `end()` before final buffered records have been emitted.

The tests assert the actual expected Unicode records, split CRLF handling, blank lines, and the final record without a trailing newline. An invalid record fixture uses explicit `errorPolicy: 'compare'` to check the error and emitted prefix together.

## A useful boundary: diagnostic callbacks can differ intentionally

For eventsource-parser 4.1.1, `unknown: value\n` emits an `unknown-field` diagnostic when fed whole. Feeding the same 15 bytes as sizes `[1, 14]` omits that diagnostic. StreamSplit reproduces the difference when the adapter's `diagnostics: true` option includes diagnostic callbacks in the event trace.

This is **not presented as an upstream defect**. The [upstream README](https://github.com/rexxars/eventsource-parser#parse-errors) explicitly describes discarding incomplete lines that cannot become valid fields before completion, without an error callback. The default integration adapter compares event/comment/retry outputs, and enables diagnostic comparison only on request. A regression test records the 3.x/4.x distinction instead of pretending all diagnostics are chunk-invariant.

This is why the adapter's observation policy must match your application. Do not silently normalize away a difference that matters to you; equally, do not report a documented diagnostic policy as a protocol bug.
