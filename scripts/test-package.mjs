import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'streamsplit-consumer-'));
const env = { ...process.env, npm_config_cache: join(root, '.npm-cache') };
try {
  const stdout = execFileSync('npm', ['pack', '--json', '--pack-destination', directory], { cwd: root, env, encoding: 'utf8' });
  const [{ filename, files }] = JSON.parse(stdout);
  assert.ok(files.some(file => file.path === 'dist/index.js'));
  assert.ok(files.some(file => file.path === 'dist/index.d.ts'));
  assert.ok(files.some(file => file.path === 'LICENSE'));
  assert.equal(files.some(file => /^(test|examples|scripts|node_modules|\.github)\//.test(file.path)), false);
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  execFileSync('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', join(directory, filename)], { cwd: directory, env, stdio: 'pipe' });
  const consumer = `import { assertChunkInvariant, checkChunkInvariant, replayChunkInvariant } from '@agent-axiom/streamsplit';
const input = new TextEncoder().encode('package consumer');
const coverage = await assertChunkInvariant({ input, createParser: emit => {
  const parts = []; return { write(chunk) { parts.push(...chunk); }, end() { emit(parts); } };
} });
if (!coverage.allSingleCutsChecked) throw Error('Coverage missing');
const broken = emit => ({ write(chunk) { emit(chunk.length); } });
const result = await checkChunkInvariant({ input, createParser: broken });
if (result.ok) throw Error('Broken parser passed');
const replay = await replayChunkInvariant({ fixture: result.failure.fixture, createParser: broken });
if (replay.ok) throw Error('Replay did not reproduce');
console.log('Packed ESM consumer and replay passed.');\n`;
  writeFileSync(join(directory, 'consumer.mjs'), consumer);
  execFileSync(process.execPath, ['consumer.mjs'], { cwd: directory, stdio: 'inherit' });
  writeFileSync(join(directory, 'consumer.mts'), `import { assertChunkInvariant, type ParserFactory } from '@agent-axiom/streamsplit';
const createParser: ParserFactory<number> = emit => ({ write(chunk) { emit(chunk.length); } });
const coverage = await assertChunkInvariant({ input: new Uint8Array(), createParser });
coverage.parserRuns satisfies number;
// @ts-expect-error Text input is not a byte fixture.
await assertChunkInvariant({ input: 'no', createParser });\n`);
  execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'consumer.mts'], { cwd: directory, stdio: 'inherit' });
  const installed = JSON.parse(readFileSync(join(directory, 'node_modules/@agent-axiom/streamsplit/package.json'), 'utf8'));
  assert.equal(Object.keys(installed.dependencies ?? {}).length, 0);
  console.log(`Packed TypeScript consumer passed. ${files.length} published files; zero runtime dependencies.`);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
