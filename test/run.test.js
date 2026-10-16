import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WAVE_SIZES, monsterDamage, spawnShares, huntRun, huntRuns } from '../src/run.js';

const dataset = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url)));

const tiny = {
  bossWave: { hpMult: 3, expMult: 2.5 },
  monsters: {
    a: { name: 'A', hp: 100, exp: 10, dmg: [0, 100], abilities: [] },
    b: { name: 'B', hp: 300, exp: 30, dmg: [0, 0], abilities: [{ element: 'fire', min: 100, max: 300, chance: 50, interval: 4000 }, { element: 'healing', min: 50, max: 50, chance: 100 }] },
  },
  hunts: [{ id: 't', name: 'T', minLevel: 1, monsters: ['a', 'b'], maxAlive: 4, bossKey: 'b' }],
};

test('uma sala tem 52 criaturas nas waves e o boss na última', () => {
  assert.equal(WAVE_SIZES.reduce((a, b) => a + b, 0), 52);
  assert.equal(huntRun(tiny, tiny.hunts[0]).kills, 53);
});

test('dano por segundo soma o corpo a corpo a cada 2 s e as magias pela chance e intervalo, sem cura', () => {
  assert.deepEqual(monsterDamage(tiny.monsters.a), { dps: 25, byElement: { physical: 25 } });
  assert.deepEqual(monsterDamage(tiny.monsters.b), { dps: 25, byElement: { fire: 25 } });
  assert.deepEqual(monsterDamage(undefined), { dps: 0, byElement: {} });
});

test('xp da sala soma as criaturas em proporção igual e o boss com 5× a exp (medido)', () => {
  const run = huntRun(tiny, tiny.hunts[0]);
  assert.equal(run.mobXp, 26 * 10 + 26 * 30);
  assert.equal(run.bossXp, 30 * 5);
  assert.equal(run.xp, 1040 + 150);
  assert.equal(run.hp, 26 * 100 + 26 * 300 + 900);
  assert.equal(run.boss.hp, 900);
  assert.equal(run.mobDps, 25);
  assert.equal(run.packDps, 100);
  assert.deepEqual(run.mobElements, { physical: 12.5, fire: 12.5 });
});

test('pesos de spawn da hunt mudam a proporção das criaturas', () => {
  const spider = dataset.hunts.find((h) => h.id === 'giant-spider');
  assert.deepEqual(spawnShares(spider).map(([, share]) => share), [0.55, 0.3, 0.15]);
  assert.deepEqual(spawnShares(tiny.hunts[0]).map(([, share]) => share), [0.5, 0.5]);
});

test('toda hunt extraída tem xp e dano na sala', () => {
  const runs = huntRuns(dataset);
  assert.equal(runs.length, dataset.hunts.length);
  assert.ok(runs.every((run) => run.xp > 0 && run.mobDps > 0));
});

test('multiplicador de exp das hunts especiais vem da tabela final do jogo', () => {
  assert.equal(dataset.monsters.mycobiontic_beetle.exp, 63525);
  assert.equal(dataset.monsters.headpecker.hp, 28525);
});
