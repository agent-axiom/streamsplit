# Changelog

Version headings describe repository changes. Check [npm](https://www.npmjs.com/package/@agent-axiom/streamsplit) for published versions.

## Unreleased

- Add optional `AbortSignal` cancellation to checking, assertions, and exact fixture replay, with a payload-redacted `CheckAbortedError`.
- Stop pending harness work without claiming to terminate the parser; clean up listeners and handle late emissions/rejections.
- Keep the version-1 replay format and zero-runtime-dependency contract unchanged.

## 0.1.1

Documentation, examples, and release-tooling update. The public API, parser harness implementation, Node >=20 requirement, and zero-runtime-dependency contract are unchanged.

- Correct the npm installation instructions and use a development dependency by default.
- Clarify that integration examples and demo commands require a source checkout.
- Document and test three real parser integrations: eventsource-parser, ndjson, and @streamparser/json. The JSON adapter and its dependency are development-only.
- Add runnable integration recipes, including the real SSE adapter's broken-decoder failure and exact fixed replay.
- Prepare an opt-in OIDC publication workflow with protected-environment and source/archive verification. Enabling publishing access remains a separate maintainer action.
- Include this changelog in the package archive.

See [integration recipes](docs/INTEGRATIONS.md) and [release preparation](docs/RELEASING.md).

## 0.1.0

Initial public package with byte-oriented chunk-invariance assertions, deterministic schedules, bounded failure reduction, exact fixture replay, ESM exports, and TypeScript declarations.
