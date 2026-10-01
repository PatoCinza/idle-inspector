import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  dropChance, monsterLoot, huntLoot, lootRows, groupByItem, charmPlans, bestiaryGoal, lootKills, codexPlan, CHANCE_SCALE,
} from '../src/model.js';

const dataset = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url)));
const session = JSON.parse(readFileSync(new URL('./fixtures/rotten-golem-session.json', import.meta.url)));
const hunt = dataset.hunts.find((h) => h.id === 'rottengolem-cave');
const within = (actual, expected, tolerance) => Math.abs(actual / expected - 1) <= tolerance;
const STACKABLES = new Set(['great spirit potion', 'ultimate health potion']);
const infernal = JSON.parse(readFileSync(new URL('./fixtures/infernal-demon-drops.json', import.meta.url)));
const infernalHunt = dataset.hunts.find((h) => h.id === 'infernalmdemon-cave');

test('um sorteio por kill: o bônus de cada membro soma na chance, que satura em 100%', () => {
  assert.ok(Math.abs(dropChance(10000, [0, 0, 0], 0) - 0.3) < 1e-12);
  assert.ok(Math.abs(dropChance(10000, [0, 9.8, 4], 0) - 0.3138) < 1e-9);
  assert.equal(dropChance(40000, [0, 0, 0], 0), 1);
  assert.equal(dropChance(CHANCE_SCALE, [50, 50, 50], 0.12), 1);
});

test('multiplicador especial reproduz a regra do cliente', () => {
  const loot = monsterLoot(dataset, 'rotten_man_maggot');
  const raw = dataset.monsters.rotten_man_maggot.loot;
  const coin = raw.find((l) => l.name === 'crystal coin');
  const boosted = loot.find((l) => l.name === 'crystal coin');
  assert.ok(boosted.chance <= dataset.lootCap);
  assert.ok(boosted.chance >= coin.chance);
});

test('boss da sala rola a tabela normal por padrão, e dá para desligar', () => {
  const killsByMonster = { rotten_golem: 600, mould_phantom: 600, branchy_crawler: 600 };
  assert.equal(lootKills({ hunt, killsByMonster, roomsPerHour: 34 }).rotten_golem, 600);
  assert.equal(lootKills({ hunt, killsByMonster, roomsPerHour: 34, bossRollsLoot: false }).rotten_golem, 566);
});

test('modelo bate com a sessão real da hunt Rotten Golem', () => {
  const hours = session.minutes / 60;
  const rows = huntLoot({
    dataset, hunt, killsByMonster: session.kills, roomsPerHour: session.roomsPerHour * hours,
    lootPcts: session.lootPcts, charms: session.charms,
  });
  const predicted = Object.fromEntries(groupByItem(rows).map((r) => [r.item, r.count]));
  assert.ok(within(session.observed['crystal coin'], predicted['crystal coin'], 0.06), 'crystal coin');
  const units = Object.keys(session.observed).filter((n) => n !== 'crystal coin' && !STACKABLES.has(n));
  const observedUnits = units.reduce((a, n) => a + session.observed[n], 0);
  const predictedUnits = units.reduce((a, n) => a + (predicted[n] ?? 0), 0);
  assert.ok(within(observedUnits, predictedUnits, 0.08), `itens ${observedUnits} vs ${predictedUnits.toFixed(0)}`);
});

test('empilhável com a chance da party acima de 100% cai em toda kill (Rotten Golem)', () => {
  const rows = lootRows({ dataset, monsterKey: 'rotten_golem', kills: session.kills.rotten_golem, lootPcts: session.lootPcts });
  const potion = rows.find((r) => r.item === 'great spirit potion');
  assert.ok(within(session.observed['great spirit potion'], potion.count, 0.03), `${session.observed['great spirit potion']} vs ${potion.count.toFixed(0)}`);
});

test('Infernal Demon: a chance satura e a quantidade é a média entre 1 e o máximo', () => {
  const rows = huntLoot({ dataset, hunt: infernalHunt, killsByMonster: infernal.kills, lootPcts: [0, 0, 0] });
  const predicted = Object.fromEntries(groupByItem(rows).map((r) => [r.item, r.count]));
  assert.ok(within(infernal.ultimateHealthPotion, predicted['ultimate health potion'], 0.03));
  const phantom = infernal.singleKill.infernal_phantom;
  const terraRod = lootRows({ dataset, monsterKey: 'infernal_phantom', kills: phantom.kills }).find((r) => r.item === 'terra rod');
  assert.equal(terraRod.count, phantom.items['terra rod']);
});

test('Infernal Demon: um drop por kill, nunca acima do máximo da tabela', () => {
  Object.entries(infernal.singleKill).forEach(([monster, { kills, ultimateHealthPotion }]) => {
    const { max } = dataset.monsters[monster].loot.find((l) => l.name === 'ultimate health potion');
    const quantities = Object.keys(ultimateHealthPotion).map(Number);
    const drops = Object.values(ultimateHealthPotion).reduce((a, b) => a + b, 0);
    assert.equal(drops, kills, monster);
    assert.ok(Math.min(...quantities) >= 1 && Math.max(...quantities) <= max, monster);
  });
});

test('Gut e Scavenge ficam em criaturas diferentes e a Scavenge vai para o Golem', () => {
  const plans = charmPlans({
    dataset, hunt, killsByMonster: { rotten_golem: 610, mould_phantom: 610, branchy_crawler: 610 },
    roomsPerHour: 34, lootPcts: session.lootPcts,
  });
  assert.ok(plans.every((p) => p.gut == null || p.gut !== p.scavenge));
  assert.equal(plans[0].scavenge, 'rotten_golem');
  assert.notEqual(plans[0].gut, 'rotten_golem');
});

test('sem Gut na conta, o plano usa só a Scavenge', () => {
  const [best] = charmPlans({
    dataset, hunt, killsByMonster: { rotten_golem: 610, mould_phantom: 610, branchy_crawler: 610 },
    roomsPerHour: 34, lootPcts: session.lootPcts, owned: { scavenge: 3 },
  });
  assert.equal(best.gut, null);
  assert.equal(best.scavenge, 'rotten_golem');
});

test('codex da hunt multiplica a base por etapa e respeita o progresso', () => {
  const plan = codexPlan({
    dataset, hunt, perHour: { roots: 100, 'mould heart': 50, 'mould robe': 30, "crawler's essence": 20 },
    progress: { done: [], prog: { 'hunt-rottengolem-cave': [1600, 300, 0, 0] } },
  });
  assert.deepEqual(plan.map((e) => e.step), ['I', 'II', 'III']);
  assert.equal(plan[0].items[0].remaining, 0);
  assert.equal(plan[0].items[1].remaining, 300);
  assert.equal(plan[0].hours, 30);
  assert.equal(plan[1].items[0].need, 8000);
});

test('meta do bestiário segue a faixa de experiência', () => {
  assert.equal(bestiaryGoal(20), 250);
  assert.equal(bestiaryGoal(150), 500);
  assert.equal(bestiaryGoal(1500), 1000);
  assert.equal(bestiaryGoal(24361), 2500);
});

test('bags rolam uma vez por kill, sem bônus de loot nem Gut', () => {
  const bag = (options) => lootRows({ dataset, monsterKey: 'rotten_golem', kills: 100000, ...options }).find((r) => r.item === 'bag you desire').count;
  const base = bag({ lootPcts: [0, 0, 0] });
  assert.ok(Math.abs(base - 7) < 1e-9);
  assert.equal(bag({ lootPcts: [0, 50, 50], gut: 0.2 }), base);
});
