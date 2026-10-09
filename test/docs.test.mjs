import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const documents = ['README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'AGENTS.md', ...readdirSync(join(root, 'docs')).filter(name => name.endsWith('.md')).map(name => `docs/${name}`)];

test('human and agent documentation links resolve locally', () => {
  for (const document of documents) {
    const source = readFileSync(join(root, document), 'utf8');
    for (const [, target] of source.matchAll(/\]\(([^)]+)\)/g)) {
      if (/^(https?:|mailto:)/.test(target)) continue;
      const [path] = target.split('#');
      if (!path) continue;
      assert.ok(existsSync(resolve(root, dirname(document), path)), `${document}: missing ${target}`);
    }
  }
});

test('the short README example works from a built checkout', () => {
  const source = readFileSync(join(root, 'README.md'), 'utf8');
  const example = source.match(/```js\n([\s\S]+?)\n```/);
  assert.ok(example, 'Expected one runnable JavaScript quickstart.');
  execFileSync(process.execPath, ['--input-type=module', '--eval', example[1]], { cwd: root, stdio: 'pipe' });
});


test('the short demo proves the broken fixture and its fixed replay', () => {
  const output = execFileSync(process.execPath, ['examples/demo-short.mjs'], { cwd: root, encoding: 'utf8' });
  assert.match(output, /WHOLE BUFFER: PASS/);
  assert.match(output, /SPLIT UTF-8: FAIL/);
  assert.match(output, /Reduced chunk sizes: \[13,7\]/);
  assert.match(output, /FIXED: PASS/);
  assert.match(output, /73 tested schedules/);
});

for (const name of ['sse', 'ndjson', 'json']) {
  test(`the runnable ${name} integration example checks its expected output`, () => {
    const output = execFileSync(process.execPath, ['examples/integrations/demo.mjs', name], { cwd: root, encoding: 'utf8' });
    assert.match(output, /expected semantic output/);
    assert.match(output, /PASS: \d+ schedules; every single cut and bytewise reads checked/);
    if (name === 'sse') {
      assert.match(output, /BROKEN: split UTF-8/);
      assert.match(output, /REPLAY: exact chunk sizes \[13,7\]/);
      assert.match(output, /exact fixture now passes/);
    }
  });
}


test('installation guides use the published package as a development dependency', () => {
  const { name } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const usage = readFileSync(join(root, 'docs/USAGE.md'), 'utf8');
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  for (const document of [readme, usage]) {
    assert.ok(document.includes(`npm install --save-dev ${name}`));
  }
  assert.doesNotMatch(usage, /not published to the npm registry yet/i);
  assert.match(usage, /not included in the npm archive/);
});


test('release metadata and packaged changelog match the current version', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(lock.packages[''].name, pkg.name);
  assert.ok(pkg.files.includes('CHANGELOG.md'));
  assert.ok(readFileSync(join(root, 'CHANGELOG.md'), 'utf8').includes(`## ${pkg.version}\n`));
});
