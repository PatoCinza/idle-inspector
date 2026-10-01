import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defenseOf, supplyPerDamage, defensiveEffect, measuredDefense, recoverySpent } from '../src/defense.js';
import { takenPerHour } from '../src/combat.js';
import { charmTable } from '../src/charm-plan.js';
import { renderCharms } from '../src/overlay/plans-view.js';

const dataset = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url)));
const fixture = JSON.parse(readFileSync(new URL('./fixtures/infernal-demon-defense.json', import.meta.url)));
const hunt = dataset.hunts.find((h) => h.id === 'infernalmdemon-cave');
const idOf = (key) => dataset.charms.find((c) => c.key === key).id;

const combat = {
  members: { knight: { hits: 1000, dealt: fixture.dealtTotal, crits: 0, critDealt: 0 } },
  foes: { 'Infernal Phantom': fixture.dealtTotal / 4, 'Infernal Demon': fixture.dealtTotal / 2, Brachiodemon: fixture.dealtTotal / 4 },
  taken: Object.fromEntries(Object.entries(fixture.taken).map(([name, stats]) => [name, { knight: stats }])),
};
const parryOnPhantom = { parry: { monster: 'infernal_phantom', tier: 3 } };
const defense = defenseOf({ dataset, takenPerHour: takenPerHour({ dataset, hunt, combat, minutes: fixture.minutes }), assigned: parryOnPhantom });

test('dano recebido junta o boss na criatura e desconta o que o charm equipado já evitou', () => {
  const phantom = fixture.taken['Infernal Phantom'];
  const observed = ((phantom.hp + phantom.mana) * 60) / fixture.minutes;
  assert.ok(Math.abs(defense.infernal_phantom.observed - observed) < 1e-6);
  assert.ok(Math.abs(defense.infernal_phantom.base - observed / 0.89) < 1e-6);
  assert.equal(defense.infernal_phantom.equipped, 'parry');
  const demon = ['Infernal Demon', 'Infernal Demon Boss'].map((name) => fixture.taken[name]).reduce((a, s) => a + s.hp + s.mana, 0);
  assert.ok(Math.abs(defense.infernal_demon.base - (demon * 60) / fixture.minutes) < 1e-6);
});

test('Parry medido no Charm Analyzer bate com 11% do dano recebido da criatura', () => {
  const stats = { ms: fixture.parry.ms, rows: [{ id: idOf('parry'), n: fixture.parry.n, v: fixture.parry.v }] };
  const [parry] = measuredDefense({ dataset, charmStats: stats, assigned: parryOnPhantom, defense });
  assert.equal(parry.key, 'parry');
  const ratio = parry.measured / parry.predicted;
  assert.ok(ratio > 0.8 && ratio < 1.1, `medido/previsto ${ratio.toFixed(2)}`);
});

test('Parry evita e reflete o mesmo valor; Dodge só evita', () => {
  assert.deepEqual(defensiveEffect({ dataset, charmKey: 'parry', tier: 3, base: 1000 }), { avoided: 110, reflected: 110 });
  assert.deepEqual(defensiveEffect({ dataset, charmKey: 'dodge', tier: 2, base: 1000 }), { avoided: 100, reflected: 0 });
});

test('custo de supply por dano recebido usa só as poções', () => {
  const { gold, minutes } = fixture.supply;
  assert.equal(recoverySpent(gold), 35100 + 54656 + 175000);
  const perDamage = supplyPerDamage({ supply: gold, minutes, defense });
  const taken = Object.values(defense).reduce((a, d) => a + d.observed, 0);
  assert.ok(Math.abs(perDamage - (264756 * 60) / minutes / taken) < 1e-9);
  assert.equal(supplyPerDamage({ supply: gold, minutes, defense: null }), null);
});

const member = { name: 'm', level: 970, maxHp: 9000, maxMana: 40000, critChance: 25, critDmg: 150, lootPct: 5 };
const party = [member, { ...member, name: 'k' }, { ...member, name: 'd' }];
const window = { huntId: hunt.id, minutes: 30, kills: { infernal_phantom: 400, infernal_demon: 450, brachiodemon: 350 }, rooms: 30, loot: {}, supply: { 'ultimate mana potion': 400000 }, since: null };
const slots = { [idOf('parry')]: { tier: 3 }, [idOf('dodge')]: { tier: 3 }, [idOf('savage_blow')]: { tier: 3 } };
const table = (overrides = {}) => charmTable({ dataset, window, party, charmSlots: slots, charmStats: null, bestiary: null, combat, ...overrides });

test('plano por lucro compara dano e defesa em gold/h; por XP o Dodge não pontua', () => {
  const profit = table();
  assert.equal(profit.objective, 'profit');
  assert.ok(profit.economy.lootPerHour > 0 && profit.economy.xpPerHour > 0);
  assert.equal(profit.economy.xpMeasured, false);
  assert.ok(profit.defense.length === 3);
  const dodge = profit.defense.find((d) => d.monster === 'infernal_demon').options.dodge;
  assert.ok(dodge.avoided > 0 && dodge.saved > 0);
  const xp = table({ objective: 'xp', xp: 5e6 });
  assert.equal(xp.economy.xpMeasured, true);
  assert.ok(xp.rows.every((r) => r.major?.charm !== 'dodge'));
  const majors = profit.rows.map((r) => r.major?.charm).filter(Boolean);
  assert.ok(majors.includes('savage_blow'));
});

test('sem dano recebido medido, Parry e Dodge ficam fora e a aba avisa', () => {
  const plain = table({ combat: { ...combat, taken: {} } });
  assert.equal(plain.defense, null);
  assert.ok(plain.rows.every((r) => !['parry', 'dodge'].includes(r.major?.charm)));
  assert.match(renderCharms(plain), /Dano recebido ainda não medido/);
  assert.match(renderCharms(table(), 'xp'), /data-objective="xp"/);
});
