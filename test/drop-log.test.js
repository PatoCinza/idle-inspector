import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  initialDropLog, observeSnapshot, disarm, killsDelta, lootDelta, gutOn, measuredQuantities, wilson, sampleTable, MIN_QUANTITY_DROPS,
} from '../src/drop-log.js';
import { initialApp, reduceApp } from '../src/app-state.js';
import { huntLoot, groupByItem } from '../src/model.js';
import { renderSample } from '../src/overlay/plans-view.js';

const dataset = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url)));
const hunt = dataset.hunts.find((h) => h.id === 'infernalmdemon-cave');
const gutId = dataset.charms.find((c) => c.key === 'gut').id;

const loot = (counts) => Object.fromEntries(Object.entries(counts).map(([item, n]) => [item, { n, g: n }]));
const state = (bestiary, counts) => ({ bestiary: { 'h:infernalmdemon-cave': 0, ...bestiary }, loot: loot(counts) });
const snapshot = (t, bestiary, counts) => ({ type: 'snapshot', t, ...state(bestiary, counts) });
const three = () => 3;

const feed = (events, env = { dataset }) => events.reduce((app, event) => reduceApp(app, event, env), initialApp());

test('deltas ignoram salas e contadores que não sobem, e o loot que desce invalida', () => {
  assert.deepEqual(killsDelta({ 'h:x': 1, troll: 5, bp: 1 }, { 'h:x': 2, troll: 6, bp: 2, orc: 0 }), { troll: 1 });
  assert.deepEqual(lootDelta(loot({ a: 1 }), loot({ a: 3, b: 1 })), { a: 2, b: 1 });
  assert.equal(lootDelta(loot({ a: 3 }), loot({ a: 1 })), null);
  assert.deepEqual(lootDelta(null, loot({ a: 1 })), {});
});

test('só registra a kill isolada depois de um patch completo', () => {
  const first = state({ infernal_phantom: 10 }, { 'crystal coin': 0 });
  const unarmed = observeSnapshot(initialDropLog(), null, snapshot(0, { infernal_phantom: 10 }, { 'crystal coin': 0 }), three);
  assert.equal(unarmed.armed, true);
  assert.deepEqual(unarmed.monsters, {});
  const log = observeSnapshot(unarmed, first, snapshot(1, { infernal_phantom: 11 }, { 'crystal coin': 1, 'ultimate health potion': 3 }), three);
  assert.deepEqual(log.monsters.infernal_phantom, {
    kills: 1,
    factor: 3,
    items: { 'crystal coin': { drops: 1, qty: { 1: 1 } }, 'ultimate health potion': { drops: 1, qty: { 3: 1 } } },
  });
});

test('patch com várias kills não entra, mas mantém a sequência', () => {
  const armed = { ...initialDropLog(), armed: true };
  const log = observeSnapshot(armed, state({ infernal_phantom: 1, brachiodemon: 1 }, {}), snapshot(1, { infernal_phantom: 2, brachiodemon: 2 }, { 'crystal coin': 2 }), three);
  assert.deepEqual(log, armed);
});

test('patch parcial com kill ou loot desarma; parcial sem mudança não', () => {
  const armed = { ...initialDropLog(), armed: true };
  const previous = state({ infernal_phantom: 1 }, { 'crystal coin': 1 });
  const killOnly = { type: 'snapshot', t: 1, bestiary: { ...previous.bestiary, infernal_phantom: 2 }, loot: null };
  assert.equal(observeSnapshot(armed, previous, killOnly, three).armed, false);
  const quiet = { type: 'snapshot', t: 1, bestiary: { ...previous.bestiary, 'h:infernalmdemon-cave': 3 }, loot: null };
  assert.equal(observeSnapshot(armed, previous, quiet, three).armed, true);
});

test('Loot Analyser zerado não vira drop', () => {
  const armed = { ...initialDropLog(), armed: true };
  const log = observeSnapshot(armed, state({ infernal_phantom: 1 }, { 'crystal coin': 9 }), snapshot(1, { infernal_phantom: 2 }, { 'crystal coin': 1 }), three);
  assert.deepEqual(log.monsters, {});
  assert.equal(log.armed, false);
});

test('reset e reconexão desarmam, e a amostra sobrevive ao reset da medição', () => {
  const app = feed([
    snapshot(0, { infernal_phantom: 1 }, { 'crystal coin': 0 }),
    snapshot(1, { infernal_phantom: 2 }, { 'crystal coin': 1 }),
    { type: 'reset', t: 2, reason: 'analyzer', loot: {} },
  ]);
  assert.equal(app.dropLog.armed, false);
  assert.equal(app.dropLog.monsters.infernal_phantom.kills, 1);
  assert.equal(disarm(app.dropLog).monsters, app.dropLog.monsters);
});

test('o fator da kill usa o bônus de loot da party e a Gut na criatura', () => {
  const slots = { [gutId]: { tier: 3, monsterKey: 'infernal_phantom' } };
  assert.equal(gutOn(dataset, slots, 'infernal_phantom'), 0.12);
  assert.equal(gutOn(dataset, slots, 'brachiodemon'), 0);
  const app = feed([
    { type: 'party', t: 0, members: [{ lootPct: 10 }, { lootPct: 0 }, { lootPct: 20 }] },
    { type: 'charms', t: 0, slots },
    snapshot(0, { infernal_phantom: 1 }, { 'crystal coin': 0 }),
    snapshot(1, { infernal_phantom: 2 }, { 'crystal coin': 1 }),
  ]);
  assert.ok(Math.abs(app.dropLog.monsters.infernal_phantom.factor - 3.3 * 1.12) < 1e-9);
});

const logWith = (monster, kills, items) => ({ armed: true, monsters: { [monster]: { kills, factor: 3 * kills, items } } });

test('quantidade medida só entra com drops suficientes', () => {
  const enough = { drops: MIN_QUANTITY_DROPS, qty: { 1: 10, 2: 10, 4: 10 } };
  const few = { drops: 5, qty: { 4: 5 } };
  const quantities = measuredQuantities(logWith('infernal_phantom', 40, { 'ultimate health potion': enough, 'terra rod': few }));
  assert.deepEqual(quantities, { infernal_phantom: { 'ultimate health potion': 7 / 3 } });
  const base = groupByItem(huntLoot({ dataset, hunt, killsByMonster: { infernal_phantom: 100 }, lootPcts: [0, 0, 0] }));
  const measured = groupByItem(huntLoot({ dataset, hunt, killsByMonster: { infernal_phantom: 100 }, lootPcts: [0, 0, 0], quantities }));
  const potion = (rows) => rows.find((r) => r.item === 'ultimate health potion').count;
  assert.ok(Math.abs(potion(base) - 250) < 1e-9);
  assert.ok(Math.abs(potion(measured) - 700 / 3) < 1e-9);
});

test('intervalo de Wilson contém a proporção e fica em [0, 1]', () => {
  const [low, high] = wilson(30, 100);
  assert.ok(low < 0.3 && high > 0.3);
  assert.deepEqual(wilson(0, 0), null);
  assert.equal(wilson(10, 10)[1], 1);
});

test('amostra compara a chance medida com a prevista e aponta desvios', () => {
  const log = logWith('infernal_phantom', 100, {
    'terra rod': { drops: 100, qty: { 1: 100 } },
    'hailstorm rod': { drops: 90, qty: { 1: 90 } },
    'ultimate health potion': { drops: 100, qty: { 1: 25, 2: 25, 3: 25, 4: 20, 6: 5 } },
    'golden mug': { drops: 1, qty: { 1: 1 } },
  });
  const table = sampleTable({ dataset, hunt, log });
  const phantom = table.creatures.find((c) => c.monster === 'infernal_phantom');
  const status = Object.fromEntries(phantom.rows.map((r) => [r.item, r.status]));
  assert.equal(status['terra rod'], 'ok');
  assert.equal(status['hailstorm rod'], 'above');
  assert.equal(status['ultimate health potion'], 'quantity');
  assert.equal(status['golden mug'], 'unlisted');
  assert.equal(table.creatures.find((c) => c.monster === 'brachiodemon').kills, 0);
  assert.equal(table.kills, 100);
});

test('aba Amostra renderiza criaturas sem kills e escapa nomes', () => {
  const log = logWith('infernal_phantom', 10, { '<b>x</b>': { drops: 1, qty: { 1: 1 } } });
  const html = renderSample(sampleTable({ dataset, hunt, log }));
  assert.ok(html.includes('Nenhuma kill isolada desta criatura'));
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'));
  assert.ok(renderSample(sampleTable({ dataset, hunt: null, log })).includes('Escolha uma hunt'));
});
