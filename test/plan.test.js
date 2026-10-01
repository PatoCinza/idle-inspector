import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialSession, reduceSession, isLive } from '../src/session.js';
import { initialApp, reduceApp } from '../src/app-state.js';
import { liveWindow, planFor, EMPTY_WINDOW } from '../src/plan.js';
import { plannedDropsTable } from '../src/drops.js';
import { renderBody, renderHuntPicker } from '../src/overlay/view.js';

const dataset = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url)));
const MIN = 60000;
const snap = (t, bestiary, loot = { 'gold coin': { n: t / MIN, g: 1 } }) => ({ type: 'snapshot', t, bestiary, loot });
const runSession = (events, from = initialSession()) => events.reduce(reduceSession, from);
const runApp = (events, from = initialApp()) => events.reduce(reduceApp, from);

const trollHunt = [
  { type: 'connect', t: 0 },
  snap(0, { 'h:troll-cave': 0, troll: 0 }),
  snap(10 * MIN, { 'h:troll-cave': 6, troll: 120 }),
];

test('medição restaurada fica escondida até o jogo confirmar a mesma hunt', () => {
  const before = runSession(trollHunt);
  assert.ok(isLive(before));
  const reloaded = runSession([{ type: 'connect', t: 60 * MIN }], before);
  assert.equal(isLive(reloaded), false);
  assert.deepEqual(liveWindow(dataset, reloaded), EMPTY_WINDOW);
  const training = runSession([snap(61 * MIN, { 'h:troll-cave': 6, troll: 120 }), snap(70 * MIN, { 'h:troll-cave': 6, troll: 120 })], reloaded);
  assert.deepEqual(liveWindow(dataset, training), EMPTY_WINDOW);
  const killing = runSession([snap(71 * MIN, { 'h:troll-cave': 6, troll: 125 })], training);
  assert.equal(liveWindow(dataset, killing).huntId, 'troll-cave');
  const room = runSession([snap(61 * MIN, { 'h:troll-cave': 6, troll: 120 }), snap(63 * MIN, { 'h:troll-cave': 7, troll: 120 })], reloaded);
  assert.ok(isLive(room));
});

test('hunt confirmada salva o ritmo de kills; medição não confirmada não sobrescreve', () => {
  const app = runApp(trollHunt);
  assert.deepEqual(app.huntRates['troll-cave'].kills, { troll: 720 });
  assert.equal(app.huntRates['troll-cave'].rooms, 36);
  assert.equal(app.huntRates['troll-cave'].minutes, 10);
  const reloaded = runApp([{ type: 'connect', t: 60 * MIN }, snap(61 * MIN, { 'h:troll-cave': 6, troll: 120 }), snap(90 * MIN, { 'h:troll-cave': 6, troll: 120 })], app);
  assert.deepEqual(reloaded.huntRates['troll-cave'], app.huntRates['troll-cave']);
});

test('plano usa a medição ao vivo, a última medição salva ou valores por kill', () => {
  const app = runApp(trollHunt);
  assert.equal(planFor({ dataset, app }).mode, 'measured');
  const reloaded = runApp([{ type: 'connect', t: 60 * MIN }], app);
  assert.equal(planFor({ dataset, app: reloaded }).hunt, null);
  assert.equal(planFor({ dataset, app: reloaded, plannedHunt: 'troll-cave' }).mode, 'saved');
  assert.equal(planFor({ dataset, app: reloaded, plannedHunt: 'rottengolem-cave' }).mode, 'perKill');
});

test('drops planejados: por hora com a medição salva, por kill sem medição', () => {
  const hunt = dataset.hunts.find((h) => h.id === 'troll-cave');
  const saved = { kills: { troll: 360, swamp_troll: 360 }, rooms: 0, minutes: 10, t: 0 };
  const perHour = plannedDropsTable({ dataset, hunt, saved });
  const perKill = plannedDropsTable({ dataset, hunt });
  assert.equal(perHour.unit, 'hour');
  assert.equal(perKill.unit, 'kill');
  const coin = (table) => table.rows.find((r) => r.item === 'gold coin');
  assert.ok(Math.abs(coin(perHour).perHour / coin(perKill).perHour - 720) < 1e-9);
  assert.equal(coin(perKill).dropped, null);
  const html = renderBody({ table: perKill, window: EMPTY_WINDOW, iconUrl: () => null, dataVersion: 'v' });
  assert.match(html, /Drops\/kill/);
  assert.match(html, /nunca medida/);
  assert.match(html, /\d kills</);
  assert.match(renderBody({ table: perHour, window: EMPTY_WINDOW, iconUrl: () => null }), /última medição: 10,0 min/);
});

test('seletor lista as hunts por level e marca a escolhida', () => {
  const html = renderHuntPicker({ hunts: dataset.hunts, selected: 'troll-cave', liveHunt: null });
  assert.match(html, /<option value="troll-cave" selected>/);
  assert.match(html, /<option value="" >|<option value="">Hunt atual/);
  const auto = renderHuntPicker({ hunts: dataset.hunts, selected: null, liveHunt: { name: 'Troll Cave' } });
  assert.match(auto, /<option value="" selected>Hunt atual \(Troll Cave\)/);
});

test('contagem do bestiário fica guardada mesmo depois do reload', () => {
  const app = runApp([...trollHunt, { type: 'connect', t: 60 * MIN }]);
  assert.deepEqual(app.bestiary, { 'h:troll-cave': 6, troll: 120 });
  assert.equal(app.session.last, null);
});
