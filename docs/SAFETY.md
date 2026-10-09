# Safety and limits

[Home](../README.md) · [Usage](USAGE.md) · [API](API.md) · [Design](DESIGN.md) · [Safety](SAFETY.md)

## Timeouts, isolation, and privacy

A timeout can reject a pending asynchronous operation and stops the check. It cannot forcibly cancel that operation, interrupt synchronously blocked JavaScript, or defeat microtask starvation. A synchronous operation that eventually returns or throws after the deadline is reported as a timeout. Use worker/process isolation for untrusted or potentially nonterminating parsers.

An optional `AbortSignal` stops checking or replay with `CheckAbortedError`, including while awaiting a parser operation. It has the same isolation limits: pending parser work is not forcibly cancelled, and synchronous work or microtask starvation can delay an external cancellation handler. The abort reason is never included in the error or fixture. See [cancellation](API.md#cancellation) for the complete contract.

The factory, parser methods, and normalization hooks are caller-provided trusted code. StreamSplit is not a sandbox. Bounds constrain the harness; they do not bound arbitrary allocations or work inside the parser. A fixed seed reproduces schedules, not external I/O, random application state, or time-dependent behavior.

There is no telemetry, network access, file access, dynamic module loading, or logging in the runtime library. It runs only the parser and hooks supplied by the caller. **Fixtures contain exact input bytes, and failure objects contain emitted values/errors.** They can hold secrets. Keep sensitive fixtures out of public issue reports and CI logs. The default assertion message omits payload values; inspect failure objects intentionally.


## Reporting a bug safely

Use synthetic input or redact the underlying data before collecting a new fixture. Do not merely redact its displayed text: `inputHex` is reversible to the exact original bytes. Failure objects also include emitted records and normalized errors. The library never saves or uploads these for you.

## What a green check means

Only the reported schedules agreed with the whole-buffer baseline. This is not protocol validation, security certification, an exhaustive partition proof, or proof that the baseline is correct. Use expected-output tests as well. Sampling and reduction limits are explicit in [the API reference](API.md).
