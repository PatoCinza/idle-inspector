import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialSession, reduceSession, windowOf } from '../src/session.js';

const MIN = 60000;
const snap = (t, bestiary, loot) => ({ type: 'snapshot', t, bestiary, loot });
const run = (events, from = initialSession()) => events.reduce(reduceSession, from);
const coins = (n, rope = 0) => ({ 'gold coin': { n, g: n }, ...(rope ? { rope: { n: rope, g: rope } } : {}) });

test('janela mede kills, salas e loot entre o primeiro e o último snapshot', () => {
  const session = run([
    snap(0, { 'h:troll-cave': 10, troll: 100, bp: 1 }, coins(50)),
    snap(10 * MIN, { 'h:troll-cave': 16, troll: 160, bp: 2 }, coins(80, 2)),
  ]);
  const window = windowOf(session);
  assert.equal(window.minutes, 10);
  assert.deepEqual(window.kills, { troll: 60 });
  assert.equal(window.rooms, 6);
  assert.deepEqual(window.loot, { 'gold coin': 30, rope: 2 });
  assert.equal(window.huntId, 'troll-cave');
});

test('só começa a medir quando há bestiário e loot', () => {
  const onlyLoot = run([snap(0, null, coins(5)), snap(MIN, null, coins(9))]);
  assert.equal(windowOf(onlyLoot).minutes, 0);
  const both = reduceSession(onlyLoot, snap(2 * MIN, { troll: 1 }, null));
  assert.equal(windowOf(both).minutes, 0);
  const later = reduceSession(both, snap(3 * MIN, { troll: 4 }, coins(12)));
  assert.equal(windowOf(later).kills.troll, 3);
});

test('loot que diminui recomeça a janela a partir do contador atual', () => {
  const session = run([
    snap(0, { troll: 100 }, coins(500)),
    snap(5 * MIN, { troll: 150 }, coins(900)),
    snap(6 * MIN, { troll: 160 }, coins(20)),
  ]);
  const window = windowOf(session);
  assert.deepEqual(window.kills, { troll: 10 });
  assert.deepEqual(window.loot, { 'gold coin': 20 });
  assert.equal(window.since.reason, 'analyzer');
});

test('resetstats zera o loot da janela e mantém a base do bestiário', () => {
  const session = run([
    snap(0, { troll: 100 }, coins(500)),
    snap(5 * MIN, { troll: 150 }, coins(900)),
    { type: 'reset', reason: 'analyzer', t: 5 * MIN, loot: {} },
    snap(8 * MIN, { troll: 170 }, coins(40)),
  ]);
  const window = windowOf(session);
  assert.equal(window.minutes, 3);
  assert.deepEqual(window.kills, { troll: 20 });
  assert.deepEqual(window.loot, { 'gold coin': 40 });
});

test('troca de hunt pelo stage descarta tudo e guarda a hunt nova', () => {
  const session = run([
    snap(0, { 'h:troll-cave': 1, troll: 100 }, coins(10)),
    snap(5 * MIN, { 'h:troll-cave': 5, troll: 150 }, coins(90)),
    { type: 'reset', reason: 'hunt', t: 5 * MIN, huntId: 'rottengolem-cave' },
    snap(7 * MIN, { 'h:troll-cave': 5, troll: 150, 'h:rottengolem-cave': 2, rotten_golem: 3 }, coins(95)),
  ]);
  const window = windowOf(session);
  assert.equal(window.huntId, 'rottengolem-cave');
  assert.equal(window.minutes, 2);
  assert.deepEqual(window.kills, { rotten_golem: 3 });
  assert.deepEqual(window.loot, { 'gold coin': 5 });
});

test('reload: o tempo e o progresso offline ficam fora da janela', () => {
  const before = run([
    snap(0, { 'h:troll-cave': 0, troll: 100 }, coins(0)),
    snap(10 * MIN, { 'h:troll-cave': 5, troll: 200 }, coins(100)),
  ]);
  const after = run([
    { type: 'connect', t: 40 * MIN },
    snap(40 * MIN, { 'h:troll-cave': 50, troll: 900 }, coins(700)),
    snap(45 * MIN, { 'h:troll-cave': 53, troll: 960 }, coins(760)),
  ], before);
  const window = windowOf(after);
  assert.equal(window.minutes, 15);
  assert.deepEqual(window.kills, { troll: 160 });
  assert.deepEqual(window.loot, { 'gold coin': 160 });
  assert.equal(window.rooms, 8);
});

test('reload sem snapshots novos preserva o que já foi medido', () => {
  const before = run([snap(0, { troll: 1 }, coins(1)), snap(6 * MIN, { troll: 31 }, coins(7))]);
  const window = windowOf(run([{ type: 'connect', t: 99 * MIN }], before));
  assert.equal(window.minutes, 6);
  assert.deepEqual(window.kills, { troll: 30 });
});

test('hunt trocada enquanto a aba estava fechada reinicia a janela', () => {
  const before = run([
    snap(0, { 'h:troll-cave': 0, troll: 10 }, coins(0)),
    snap(10 * MIN, { 'h:troll-cave': 4, troll: 90 }, coins(50)),
  ]);
  const after = run([
    { type: 'connect', t: 30 * MIN },
    snap(30 * MIN, { 'h:troll-cave': 4, troll: 90, 'h:rottengolem-cave': 0 }, coins(50)),
    snap(35 * MIN, { 'h:troll-cave': 4, troll: 90, 'h:rottengolem-cave': 3, rotten_golem: 40 }, coins(80)),
  ], before);
  const window = windowOf(after);
  assert.equal(window.huntId, 'rottengolem-cave');
  assert.equal(window.minutes, 5);
  assert.deepEqual(window.kills, { rotten_golem: 40 });
  assert.equal(window.since.reason, 'hunt');
});

test('estado da sessão é serializável em JSON', () => {
  const session = run([snap(0, { troll: 1 }, coins(1)), snap(MIN, { troll: 4 }, coins(3))]);
  assert.deepEqual(JSON.parse(JSON.stringify(session)), session);
});

test('janela soma o gasto do Supply Analyser e aceita o analyser zerado', () => {
  const supply = (g) => ({ 'ultimate mana potion': { n: g / 488, g } });
  const session = run([
    { ...snap(0, { troll: 1 }, coins(1)), supply: supply(976) },
    { ...snap(MIN, { troll: 2 }, coins(2)), supply: supply(2928) },
    { type: 'snapshot', t: 2 * MIN, bestiary: null, loot: null, supply: supply(488) },
  ]);
  assert.deepEqual(windowOf(session).supply, { 'ultimate mana potion': 1952 + 488 });
});
