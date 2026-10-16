import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextVersion } from '../scripts/bump-version.js';

test('bump sobe patch por padrão e zera as partes menores', () => {
  assert.equal(nextVersion('0.3.0'), '0.3.1');
  assert.equal(nextVersion('0.3.9', 'minor'), '0.4.0');
  assert.equal(nextVersion('0.3.9', 'major'), '1.0.0');
});

test('bump aceita uma versão explícita e recusa o resto', () => {
  assert.equal(nextVersion('0.3.0', '0.5.2'), '0.5.2');
  assert.throws(() => nextVersion('0.3.0', 'grande'), /major, minor, patch/);
});
