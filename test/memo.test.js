import { test } from 'node:test';
import assert from 'node:assert/strict';
import { perObject, perObjectAndKey, perObjectPair, lastBy } from '../src/memo.js';

const counting = (fn) => {
  const calls = [];
  return { calls, fn: (...args) => { calls.push(args); return fn(...args); } };
};

test('perObject calcula uma vez por objeto', () => {
  const { calls, fn } = counting((object) => ({ size: Object.keys(object).length }));
  const memo = perObject(fn);
  const a = { x: 1 };
  assert.equal(memo(a), memo(a));
  assert.notEqual(memo(a), memo({ x: 1 }));
  assert.equal(calls.length, 2);
});

test('perObjectAndKey e perObjectPair separam por chave e por par de objetos', () => {
  const byKey = counting((object, key) => `${object.id}:${key}`);
  const keyed = perObjectAndKey(byKey.fn);
  const dataset = { id: 'd' };
  assert.deepEqual([keyed(dataset, 'a'), keyed(dataset, 'a'), keyed(dataset, 'b')], ['d:a', 'd:a', 'd:b']);
  assert.equal(byKey.calls.length, 2);
  const byPair = counting((first, second) => ({ first, second }));
  const paired = perObjectPair(byPair.fn);
  const hunt = {};
  assert.equal(paired(dataset, hunt), paired(dataset, hunt));
  assert.notEqual(paired(dataset, hunt), paired(dataset, {}));
  assert.equal(byPair.calls.length, 2);
});

test('lastBy reaproveita o último resultado enquanto as referências não mudam', () => {
  const { calls, fn } = counting((app) => ({ total: app.items.length }));
  const memo = lastBy((app) => [app.items], fn);
  const items = [1, 2];
  const first = memo({ items });
  assert.equal(memo({ items, other: 1 }), first);
  assert.notEqual(memo({ items: [1, 2] }), first);
  assert.equal(calls.length, 2);
});
