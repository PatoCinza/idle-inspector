import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bestiaryTable, planKillRates } from '../src/bestiary.js';
import { renderBestiary } from '../src/overlay/plans-view.js';
import { bestiaryGoal } from '../src/model.js';

const dataset = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url)));
const hunt = dataset.hunts.find((h) => h.id === 'rottengolem-cave');
const [first] = hunt.monsters;
const window = { huntId: hunt.id, minutes: 30, kills: { [first]: 300 }, rooms: 40, loot: {}, since: null };

test('sem hunt escolhida a tabela não fica pronta', () => {
  assert.equal(bestiaryTable({ dataset, hunt: null, counts: {} }).ready, false);
  assert.match(renderBestiary(bestiaryTable({ dataset, hunt: null, counts: {} })), /Escolha uma hunt/);
});

test('meta, faltam e tempo usam o ritmo de kills e a contagem salva', () => {
  const plan = { mode: 'measured', live: window, saved: null };
  const table = bestiaryTable({ dataset, hunt, killsByMonster: planKillRates(plan), counts: { [first]: 100 }, mode: 'measured' });
  const row = table.rows.find((r) => r.monster === first);
  const goal = bestiaryGoal(dataset.monsters[first].exp);
  assert.equal(row.have, 100);
  assert.equal(row.remaining, Math.max(0, goal - 100));
  assert.equal(row.hours, row.remaining / 600);
});

test('hunt escolhida usa a última medição salva ou fica sem tempo', () => {
  const saved = { kills: { [first]: 300 }, rooms: 10, minutes: 20, t: Date.UTC(2026, 9, 1, 12) };
  const savedPlan = { mode: 'saved', saved, live: { kills: {}, minutes: 0 } };
  const timed = bestiaryTable({ dataset, hunt, killsByMonster: planKillRates(savedPlan), counts: {}, mode: 'saved', saved });
  assert.equal(timed.rows.find((r) => r.monster === first).hours, timed.rows.find((r) => r.monster === first).remaining / 300);
  assert.match(renderBestiary(timed), /ritmo da última medição/);
  const untimed = bestiaryTable({ dataset, hunt, killsByMonster: planKillRates({ mode: 'perKill' }), counts: { [first]: 5 }, mode: 'perKill' });
  assert.ok(untimed.rows.every((r) => r.hours === Infinity || r.remaining === 0));
  assert.equal(untimed.rows.find((r) => r.monster === first).have, 5);
  assert.match(renderBestiary(untimed), /nunca medida/);
});

test('render lista uma linha por criatura e escapa nomes', () => {
  const table = bestiaryTable({ dataset, hunt, counts: {}, mode: 'perKill' });
  const html = renderBestiary({ ...table, rows: [{ ...table.rows[0], name: '<b>x</b>' }] });
  assert.ok(!html.includes('<b>x</b>'));
  assert.equal((renderBestiary(table).match(/<tbody>.*<\/tbody>/s)[0].match(/<tr>/g) ?? []).length, table.rows.length);
});
