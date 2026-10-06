# Contributing

Keep StreamSplit small and honest. Its job is to compare observable parser outcomes across byte partitions, then make a failure easy to reproduce.

## Local verification

```sh
npm ci
npm run check
npm run demo
```

Use Node 20 or later. `npm run check` includes compilation, behavior tests, compile-time API tests, and a clean packed-package consumer. No network service is required by the test suite; initial dependency installation requires the npm registry.

For a bug fix, add a deterministic regression test. Include the smallest **safe-to-share** input you can, the parser adapter, exact chunk sizes or fixture, options, and Node version. Do not post production secrets or private customer input.

Useful contributions improve boundary coverage, diagnostics, reproducibility, or compatibility without hiding limits. New adapters belong in examples until there is a clear reason for runtime integration. Preserve the zero-runtime-dependency design and avoid executing source files, loading user-specified modules, making network calls, or adding a background process.

Success must never mean that an execution budget expired. A smaller fixture is not automatically a global minimum. Benchmarks and coverage claims need a reproducible workload and explicit bounds.
