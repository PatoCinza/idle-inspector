import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dropsTable, findHunt, MIN_MINUTES } from '../src/drops.js';
import { huntLoot, groupByItem } from '../src/model.js';

const dataset = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url)));
const session = JSON.parse(readFileSync(new URL('./fixtures/rotten-golem-session.json', import.meta.url)));
const hunt = dataset.hunts.find((h) => h.id === 'rottengolem-cave');
const gutId = dataset.charms.find((c) => c.key === 'gut').id;

const window = {
  huntId: 'rottengolem-cave',
  minutes: session.minutes,
  kills: session.kills,
  rooms: Math.round((session.roomsPerHour * session.minutes) / 60),
  loot: session.observed,
  since: null,
};
const party = session.lootPcts.map((lootPct, i) => ({ name: `p${i}`, lootPct }));
const slots = { [gutId]: { tier: 3, monsterKey: 'branchy_crawler' } };
const table = (overrides = {}) => dropsTable({ dataset, window, party, charmSlots: slots, ...overrides });
const rowOf = (name, result = table()) => result.rows.find((r) => r.item === name);

test('drops/h bate com o modelo para as mesmas kills', () => {
  const hours = session.minutes / 60;
  const expected = Object.fromEntries(groupByItem(huntLoot({
    dataset,
    hunt,
    killsByMonster: session.kills,
    roomsPerHour: session.roomsPerHour * hours,
    lootPcts: session.lootPcts,
    charms: session.charms,
  })).map((r) => [r.item, r.count / hours]));
  const crystal = rowOf('crystal coin');
  assert.ok(Math.abs(crystal.perHour / expected['crystal coin'] - 1) < 0.02);
});

test('cada linha traz ícone, criaturas, chance, valor, 1 a cada e caiu', () => {
  const crystal = rowOf('crystal coin');
  assert.equal(crystal.iconId, dataset.itemIds['crystal coin']);
  assert.ok(crystal.creatures.length > 0);
  assert.ok(crystal.chance > 0 && crystal.chance <= 1);
  assert.ok(Math.abs(crystal.everyHours - 1 / crystal.perHour) < 1e-12);
  assert.equal(crystal.valuePerHour > 0, true);
  assert.equal(crystal.dropped, session.observed['crystal coin']);
  assert.equal(crystal.currency, true);
});

test('linhas saem ordenadas por valor/h decrescente', () => {
  const values = table().rows.map((r) => r.valuePerHour ?? 0);
  assert.deepEqual(values, [...values].sort((a, b) => b - a));
});

test('item sem preço no dataset fica sem valor/h', () => {
  const { prices } = dataset;
  const name = Object.keys(prices).find((item) => table().rows.some((r) => r.item === item && !r.currency));
  const { [name]: removed, ...rest } = prices;
  const result = dropsTable({ dataset: { ...dataset, prices: rest }, window, party });
  assert.ok(removed > 0);
  assert.equal(rowOf(name, result).valuePerHour, null);
});

test('Gut equipado aumenta os drops da criatura que o recebeu', () => {
  const withGut = table();
  const withoutGut = table({ charmSlots: null });
  const total = (t) => t.totals.total;
  assert.ok(total(withGut) > total(withoutGut));
});

test('bônus de loot da party lido aumenta os drops e sem leitura usa 0%', () => {
  const read = table({ charmSlots: null });
  const unread = table({ charmSlots: null, party: null });
  assert.equal(read.partyRead, true);
  assert.equal(unread.partyRead, false);
  assert.ok(read.totals.items > unread.totals.items);
});

test('janela curta demais ainda não mostra tabela', () => {
  const short = dropsTable({ dataset, window: { ...window, minutes: MIN_MINUTES - 0.5 }, party });
  assert.equal(short.ready, false);
  assert.deepEqual(short.rows, []);
});

test('hunt desconhecida sem kills não mostra tabela', () => {
  const empty = dropsTable({ dataset, window: { ...window, huntId: null, kills: {} }, party });
  assert.equal(empty.ready, false);
});

test('hunt é reconhecida pelas criaturas quando o id ainda não apareceu', () => {
  assert.equal(findHunt(dataset, { huntId: null, kills: session.kills }).id, 'rottengolem-cave');
});
