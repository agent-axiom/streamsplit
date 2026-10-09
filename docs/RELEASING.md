# Release readiness

[Home](../README.md) · [Usage](USAGE.md) · [Integrations](INTEGRATIONS.md) · [Safety](SAFETY.md)

This repository can build and verify a release candidate without registry credentials. The read-only readiness workflow does not publish. A separate opt-in publishing workflow is prepared below; it stays disabled until explicitly configured.

## Build the exact candidate

```sh
npm ci
npm run release:check
```

The command runs the full test/type/packed-consumer checks and short demo, then writes an installable tarball and `release/manifest.json` with SHA-256, npm integrity, package version, file list, and source commit when the checkout is clean. A dirty/non-Git checkout explicitly leaves `sourceCommit` null. The hash identifies the tarball; this manifest is not npm provenance or an independent attestation.

The manually triggered **Release readiness** GitHub Actions workflow runs the same checks and stores the candidate for 14 days. It has read-only repository permissions and no OIDC permission or registry-publishing step.

## Maintainer decisions before the next publication

1. Confirm the npm account and its right to publish under `@agent-axiom`. Owning the GitHub organization does not confer npm scope ownership. Confirm 2FA and the exact intended package name/version.
2. Check the current registry state at release time. An unauthenticated registry E404 only means the package is not publicly accessible; it does not establish ownership or availability of its scope.
3. Review the exact tarball, its contents/hash, the clean source commit, and that commit's CI result. Confirm public publication of this version. A version cannot simply be overwritten with a different tarball.
4. Perform only the separately authorized publication, using interactive npm authentication or the configured workflow below. Do not copy long-lived tokens into the repository, chat, or CI. Publication and creating persistent publisher access are separate decisions.
5. Verify that the installed registry version, exported API, metadata, and tarball match the reviewed candidate. Version 0.1.0 is already published; do not overwrite it or imply these repository changes are in that version.

The package metadata sets public access explicitly, but metadata alone does not authorize or perform publication. `prepublishOnly` runs the complete verification suite as an additional guard.

## Prepared automatic release workflow

[Publish approved npm release](https://github.com/agent-axiom/streamsplit/blob/main/.github/workflows/publish.yml) reacts to a published, non-prerelease GitHub release. It does nothing unless `NPM_PUBLISH_ENABLED` is exactly `true`. This PR neither enables that variable nor creates an npm publisher, environment protection, tag, or release.

Once enabled, the workflow:

1. Requires a stable `vX.Y.Z` tag matching `package.json`, a clean checkout, and a tagged commit in `main` history. Bump both package manifests in a reviewed PR before a new release.
2. Installs locked dependencies without install scripts, runs `release:check`, and uploads the tested archive with its source commit, SHA-256, and npm integrity. Release jobs do not restore dependency caches.
3. Waits at the `npm` environment. Only this job has OIDC permission. It downloads the same candidate, verifies its source/hash, and publishes that tarball with lifecycle scripts disabled. It neither rebuilds nor installs dependencies while holding publishing permission.
4. Checks the registry's name, version, integrity, and provenance metadata. This metadata check does not independently cryptographically verify the attestation. If a post-publish check fails, inspect the registry before rerunning; an already-published version cannot be overwritten.

The Node 20/22/24 PR checks must pass for the exact release commit before a maintainer approves the release. The workflow itself verifies on Node 24; it does not query or bypass branch protections.

## Separate approvals and setup

Official requirements rechecked **2026-10-08**:

- npm publisher setup needs package write access and account 2FA. The package must exist. `npm trust` setup commands require npm >=11.15.0; publishing itself requires npm >=11.5.1 and Node >=22.14.
- Approve persistent publishing access for `@agent-axiom/streamsplit` from GitHub owner `agent-axiom`, repository `streamsplit`, workflow filename `publish.yml`, environment `npm`. The filename is case-sensitive and excludes `.github/workflows/`.
- This workflow uses direct `npm publish`, which must be explicitly allowed. New publishers otherwise default to staging; granting stage-only access will not enable this workflow. Dist-tag management is not needed.
- Before enabling, approve/configure the GitHub `npm` environment with required reviewers and restricted deployment tags. Enable prevent-self-review only with a reviewer other than the release initiator; a sole maintainer needs an explicitly agreed self-approval policy or a second reviewer. Protect release tags and `main` as appropriate. A YAML environment name alone does not establish these protections.
- Configure near the approved next release: a new publisher expires unless it successfully publishes within two days. Use GitHub-hosted runners. Public GitHub/public npm OIDC releases receive automatic provenance.
- After verifying protections and npm configuration, separately set the repository Actions variable `NPM_PUBLISH_ENABLED=true` (not an environment variable: the candidate job checks it before entering `npm`). Publishing the next GitHub release starts the workflow; environment approval releases the reviewed candidate. No npm token secret is required.

Creating persistent trust, enabling automatic publication, and approving a specific release are separate actions. None has been performed by preparing these files. Changing existing npm publishing-access settings or revoking credentials also requires its own authorization.

## Official references

- [npm scopes](https://docs.npmjs.com/about-scopes/)
- [Public scoped publication](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)
- [Trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [Trusted-publisher prerequisites](https://docs.npmjs.com/cli/v12/commands/npm-trust/)
- [Staged publishing](https://docs.npmjs.com/staged-publishing/)
- [Provenance](https://docs.npmjs.com/generating-provenance-statements/)
- [GitHub deployment/environment protections](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
