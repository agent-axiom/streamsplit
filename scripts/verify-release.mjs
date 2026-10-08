import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJSON = path => JSON.parse(readFileSync(path, 'utf8'));
export function validateReleaseTag(tag, version) {
  assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, 'Only stable versions are published by this workflow.');
  assert.equal(tag, `v${version}`, 'Release tag must match package.json exactly.');
}
export function validateCandidate(manifest, archive, { name, version, sourceCommit }) {
  assert.equal(manifest.package, name);
  assert.equal(manifest.version, version);
  assert.match(sourceCommit, /^[a-f0-9]{40}$/);
  assert.equal(manifest.sourceCommit, sourceCommit, 'Candidate must come from the verified clean checkout.');
  assert.equal(manifest.filename, `agent-axiom-streamsplit-${version}.tgz`);
  assert.equal(manifest.sha256, createHash('sha256').update(archive).digest('hex'), 'Candidate SHA-256 mismatch.');
  assert.equal(manifest.integrity, `sha512-${createHash('sha512').update(archive).digest('base64')}`, 'Candidate npm integrity mismatch.');
}
export function validateRegistry(manifest, metadata) {
  assert.equal(metadata.name, manifest.package);
  assert.equal(metadata.version, manifest.version);
  assert.equal(metadata.dist?.integrity, manifest.integrity, 'Registry archive differs from the verified candidate.');
  assert.ok(metadata.dist?.attestations?.url, 'Expected OIDC provenance metadata is missing; investigate before calling this release verified.');
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pkg = readJSON(join(root, 'package.json'));
  validateReleaseTag(process.env.RELEASE_TAG, pkg.version);
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const head = git(['rev-parse', 'HEAD']);
  const lock = readJSON(join(root, 'package-lock.json'));
  assert.equal(lock.version, pkg.version, 'Lockfile version must match package.json.');
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(lock.packages[''].name, pkg.name);
  if (process.argv[2] === 'source') {
    assert.equal(process.env.GITHUB_REPOSITORY, 'agent-axiom/streamsplit');
    assert.equal(process.env.GITHUB_EVENT_NAME, 'release');
    assert.equal(git(['rev-parse', `refs/tags/${process.env.RELEASE_TAG}^{commit}`]), head);
    execFileSync('git', ['merge-base', '--is-ancestor', head, 'refs/remotes/origin/main'], { cwd: root });
    assert.equal(git(['status', '--porcelain']), '', 'Release checkout must be clean.');
    console.log(`Verified stable tag ${process.env.RELEASE_TAG} at ${head} on main history.`);
  } else {
    const manifest = readJSON(join(root, 'release/manifest.json'));
    assert.equal(basename(manifest.filename), manifest.filename);
    validateCandidate(manifest, readFileSync(join(root, 'release', manifest.filename)), { name: pkg.name, version: pkg.version, sourceCommit: head });
    if (process.argv[2] === 'registry') {
      const metadata = JSON.parse(execFileSync('npm', ['view', `${pkg.name}@${pkg.version}`, '--json', '--registry=https://registry.npmjs.org'], { cwd: root, encoding: 'utf8' }));
      validateRegistry(manifest, metadata);
      console.log('Registry version, candidate integrity, and provenance metadata verified.');
    } else {
      assert.equal(process.argv[2], 'candidate', 'Choose source, candidate, or registry.');
      console.log(`Verified candidate ${manifest.filename} for source ${head}.`);
    }
  }
}
