import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateReleaseTag, validateCandidate, validateRegistry } from '../scripts/verify-release.mjs';

test('release guard accepts exact stable tags and rejects mismatches, prereleases, and shell input', () => {
  validateReleaseTag('v0.1.1', '0.1.1');
  for (const [tag, version] of [['v0.1.0', '0.1.1'], ['v0.1.1-beta.1', '0.1.1-beta.1'], ['v01.1.1', '01.1.1'], ['v0.1.1; echo nope', '0.1.1']]) {
    assert.throws(() => validateReleaseTag(tag, version));
  }
});

test('release guard binds candidate bytes, source, package, and version', () => {
  const archive = Buffer.from('synthetic archive');
  const expected = { name: '@agent-axiom/streamsplit', version: '0.1.1', sourceCommit: 'a'.repeat(40) };
  const manifest = { package: expected.name, version: expected.version, sourceCommit: expected.sourceCommit, filename: 'agent-axiom-streamsplit-0.1.1.tgz', sha256: createHash('sha256').update(archive).digest('hex'), integrity: `sha512-${createHash('sha512').update(archive).digest('base64')}` };
  validateCandidate(manifest, archive, expected);
  assert.throws(() => validateCandidate(manifest, Buffer.from('tampered'), expected));
  for (const changed of [{ sourceCommit: null }, { sourceCommit: 'b'.repeat(40) }, { package: '@other/package' }, { version: '0.1.2' }, { filename: '../candidate.tgz' }, { integrity: 'sha512-wrong' }]) {
    assert.throws(() => validateCandidate({ ...manifest, ...changed }, archive, expected));
  }
  const metadata = { name: expected.name, version: expected.version, dist: { integrity: manifest.integrity, attestations: { url: 'https://registry.npmjs.org/-/npm/v1/attestations/example' } } };
  validateRegistry(manifest, metadata);
  assert.throws(() => validateRegistry(manifest, { ...metadata, dist: { integrity: 'wrong' } }));
  assert.throws(() => validateRegistry(manifest, { ...metadata, dist: { integrity: manifest.integrity } }));
});

test('release workflow is opt-in and confines OIDC to the protected publishing job', () => {
  const source = readFileSync(new URL('../.github/workflows/publish.yml', import.meta.url), 'utf8');
  const [candidate, publish] = source.split('\n  publish:\n');
  assert.match(candidate, /vars\.NPM_PUBLISH_ENABLED == 'true'/);
  assert.doesNotMatch(candidate, /id-token: write/);
  assert.match(publish, /environment: npm/);
  assert.match(publish, /id-token: write/);
  assert.match(publish, /--ignore-scripts/);
  assert.doesNotMatch(source, /secrets\.|NODE_AUTH_TOKEN|npm login/);
});


test('release CLI rejects dirty and unmerged source checkouts', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'streamsplit-release-guard-'));
  const env = { ...process.env, RELEASE_TAG: 'v0.1.1', GITHUB_REPOSITORY: 'agent-axiom/streamsplit', GITHUB_EVENT_NAME: 'release' };
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  const run = () => execFileSync(process.execPath, ['scripts/verify-release.mjs', 'source'], { cwd, env, stdio: 'pipe' });
  try {
    mkdirSync(join(cwd, 'scripts'));
    copyFileSync(new URL('../scripts/verify-release.mjs', import.meta.url), join(cwd, 'scripts/verify-release.mjs'));
    const pkg = { name: '@agent-axiom/streamsplit', version: '0.1.1' };
    writeFileSync(join(cwd, 'package.json'), JSON.stringify(pkg));
    writeFileSync(join(cwd, 'package-lock.json'), JSON.stringify({ ...pkg, packages: { '': pkg } }));
    git('init', '-q');
    git('add', '.');
    const commit = () => git('-c', 'user.name=Release test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'synthetic source');
    commit();
    git('tag', 'v0.1.1');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    assert.match(run().toString(), /Verified stable tag/);
    writeFileSync(join(cwd, 'untracked.txt'), 'dirty');
    assert.throws(run);
    git('add', '.');
    commit();
    git('tag', '-f', 'v0.1.1');
    assert.throws(run, 'A release commit outside main history must fail.');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
