import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

test('published widget script parses as browser JavaScript', () => {
  const source = readFileSync(new URL('../public/widget.js', import.meta.url), 'utf8');
  assert.doesNotThrow(() => new Script(source, { filename: 'public/widget.js' }));
});
