# Release readiness

[Home](../README.md) · [Usage](USAGE.md) · [Integrations](INTEGRATIONS.md) · [Safety](SAFETY.md)

This repository can build and verify a release candidate without registry credentials. It does not automatically publish to npm, create tokens, configure a trusted publisher, or claim a registry release exists.

## Build the exact candidate

```sh
npm ci
npm run release:check
```

The command runs the full test/type/packed-consumer checks and short demo, then writes an installable tarball and `release/manifest.json` with SHA-256, npm integrity, package version, file list, and source commit when the checkout is clean. A dirty/non-Git checkout explicitly leaves `sourceCommit` null. The hash identifies the tarball; this manifest is not npm provenance or an independent attestation.

The manually triggered **Release readiness** GitHub Actions workflow runs the same checks and stores the candidate for 14 days. It has read-only repository permissions and no OIDC permission or registry-publishing step.

## Maintainer decisions before publication

1. Confirm the npm account and its right to publish under `@agent-axiom`. Owning the GitHub organization does not confer npm scope ownership. Confirm 2FA and the exact intended package name/version.
2. Check the current registry state at release time. An unauthenticated registry E404 only means the package is not publicly accessible; it does not establish ownership or availability of its scope.
3. Review the exact tarball, its contents/hash, the clean source commit, and that commit's CI result. Confirm public publication of this version. A version cannot simply be overwritten with a different tarball.
4. Perform the authorized first publication using the owner's interactive npm authentication. Do not copy long-lived tokens into the repository, chat, or CI. First publication and creating persistent publisher access are separate decisions.
5. Verify that the installed registry version, exported API, metadata, and tarball match the reviewed candidate. Only then replace the README's not-yet-published notice with the verified single-command install.

The package metadata sets public access explicitly, but metadata alone does not authorize or perform publication. `prepublishOnly` runs the complete verification suite as an additional guard.

## Trusted publishing for later releases

Requirements checked against official documentation on **2026-10-06**; recheck them when configuring the publisher:

- The package must already exist, and the npm account needs package write access and 2FA.
- GitHub OIDC publication requires a GitHub-hosted runner, Node >=22.14, npm >=11.5.1, and a publishing job with `id-token: write` plus `contents: read`.
- npm's publisher configuration must match repository owner `agent-axiom`, repository `streamsplit`, the exact workflow basename, and its environment when configured.
- Publisher setup creates persistent publishing access. Have the owner approve and perform that setup; the current readiness workflow intentionally cannot publish.
- Current npm publisher configurations default to stage-only publication; direct publishing must be explicitly permitted if desired. New configurations must successfully publish within two days, so configure close to the actual release.
- Use owner-approved release/environment protections. GitHub OIDC provenance is automatic for a public package from a public repository; verify the published version's provenance rather than assuming it exists.

npm also supports staged publication, including a public placeholder for a new package. Staging is still an external publication action and is not part of this readiness check.

## Official references

- [npm scopes](https://docs.npmjs.com/about-scopes/)
- [Public scoped publication](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)
- [Trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [Trusted-publisher prerequisites](https://docs.npmjs.com/cli/v12/commands/npm-trust/)
- [Staged publishing](https://docs.npmjs.com/staged-publishing/)
- [Provenance](https://docs.npmjs.com/generating-provenance-statements/)
- [GitHub deployment/environment protections](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
