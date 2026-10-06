import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const env = { ...process.env, npm_config_cache: join(root, '.npm-cache') };
const command = args => execFileSync('npm', args, { cwd: root, env, stdio: 'inherit' });
command(['run', 'check']);
command(['run', 'demo:short']);
const destination = join(root, 'release');
mkdirSync(destination, { recursive: true });
const [{ filename, size, unpackedSize, integrity, files }] = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', destination], { cwd: root, env, encoding: 'utf8' }));
const packageInfo = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
let sourceCommit = null;
try {
  const clean = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === '';
  if (clean) sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
} catch { /* A tarball hash is still useful outside a clean Git checkout. */ }
const manifest = {
  package: packageInfo.name, version: packageInfo.version, sourceCommit,
  filename, size, unpackedSize, integrity,
  sha256: createHash('sha256').update(readFileSync(join(destination, filename))).digest('hex'),
  files: files.map(file => file.path),
  registryPublication: 'not-performed',
};
writeFileSync(join(destination, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Release candidate verified: release/${filename}`);
console.log(`SHA-256: ${manifest.sha256}`);
console.log(sourceCommit ? `Source commit: ${sourceCommit}` : 'Source commit not attested: checkout is dirty or has no Git history.');
console.log('No registry publication, credentials, or publisher configuration performed.');
