import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bestiaryTable } from '../src/bestiary.js';
import { renderBestiary } from '../src/overlay/plans-view.js';
import { bestiaryGoal } from '../src/model.js';

const dataset = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url)));
const hunt = dataset.hunts.find((h) => h.id === 'rottengolem-cave');
const [first] = hunt.monsters;
const window = { huntId: hunt.id, minutes: 30, kills: { [first]: 300 }, rooms: 40, loot: {}, since: null };

test('sem hunt identificada a tabela não fica pronta', () => {
  assert.equal(bestiaryTable({ dataset, window: { ...window, huntId: null, kills: {} }, counts: {} }).ready, false);
});

test('meta, faltam e tempo usam o ritmo da janela e a contagem salva', () => {
  const table = bestiaryTable({ dataset, window, counts: { [first]: 100 } });
  const row = table.rows.find((r) => r.monster === first);
  const goal = bestiaryGoal(dataset.monsters[first].exp);
  assert.equal(row.have, 100);
  assert.equal(row.remaining, Math.max(0, goal - 100));
  assert.equal(row.hours, row.remaining / 600);
});

test('antes de 2 min de janela o tempo fica indefinido', () => {
  const table = bestiaryTable({ dataset, window: { ...window, minutes: 1 }, counts: {} });
  assert.ok(table.rows.every((r) => r.hours === Infinity || r.remaining === 0));
});

test('render lista uma linha por criatura e escapa nomes', () => {
  const table = bestiaryTable({ dataset, window, counts: {} });
  const html = renderBestiary({ ...table, rows: [{ ...table.rows[0], name: '<b>x</b>' }] });
  assert.ok(!html.includes('<b>x</b>'));
  assert.equal((renderBestiary(table).match(/<tbody>.*<\/tbody>/s)[0].match(/<tr>/g) ?? []).length, table.rows.length);
});
