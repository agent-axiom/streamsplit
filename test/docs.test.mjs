import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const documents = ['README.md', 'CONTRIBUTING.md', 'AGENTS.md', ...readdirSync(join(root, 'docs')).filter(name => name.endsWith('.md')).map(name => `docs/${name}`)];

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
