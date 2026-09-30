import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  charmPlan, creatureWeights, damageGain, normalizeParty, calibrate,
} from '../src/charms.js';

const dataset = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url)));
const hunt = dataset.hunts.find((h) => h.id === 'rottengolem-cave');
const killsByMonster = { rotten_golem: 630, mould_phantom: 598, branchy_crawler: 584 };
const party = [
  { level: 871, maxHp: 16146, maxMana: 4964, critChance: 17.572, critDmg: 143.534, avatarUptime: 36, avgHit: 2800, lootPct: 0 },
  { level: 865, maxHp: 5466, maxMana: 30570, critChance: 17.922, critDmg: 82.534, avatarUptime: 39, avgHit: 2800, lootPct: 9.8 },
  { level: 905, maxHp: 5393, maxMana: 33708, critChance: 24.472, critDmg: 152.034, avatarUptime: 43, avgHit: 2800, lootPct: 4 },
];
const owned = {
  wound: 3, freeze: 3, zap: 3, divine_wrath: 3, parry: 3, savage_blow: 3,
  adrenaline_burst: 3, scavenge: 3, gut: 3, fatal_hold: 3,
};
const plan = charmPlan({ dataset, hunt, killsByMonster, roomsPerHour: 34.4, lootPcts: [0, 9.8, 4], party, owned });

test('o boss pesa mais no HP que a party precisa tirar', () => {
  const w = creatureWeights({ dataset, hunt, killsByMonster, roomsPerHour: 34.4 });
  assert.ok(w.rotten_golem > w.mould_phantom);
  assert.ok(Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test('resistência negativa aumenta o proc elemental', () => {
  const members = normalizeParty(party);
  const zap = damageGain({ dataset, charmKey: 'zap', tier: 3, monsterKey: 'rotten_golem', party: members });
  const holy = damageGain({ dataset, charmKey: 'divine_wrath', tier: 3, monsterKey: 'rotten_golem', party: members });
  assert.ok(zap > holy);
});

test('cada criatura recebe no máximo um major e um minor, e nenhum charm se repete', () => {
  const majors = plan.rows.map((r) => r.major?.charm).filter(Boolean);
  const minors = plan.rows.map((r) => r.minor?.charm).filter(Boolean);
  assert.equal(new Set(majors).size, majors.length);
  assert.equal(new Set(minors).size, minors.length);
  assert.equal(plan.rows.length, 3);
});

test('Savage Blow vai para a criatura do boss com crítico alto', () => {
  const golem = plan.rows.find((r) => r.monster === 'rotten_golem');
  assert.equal(golem.major.charm, 'savage_blow');
});

test('Gut e Scavenge vêm antes, e a Fatal Hold fica com a criatura que sobra', () => {
  const minors = Object.fromEntries(plan.rows.map((r) => [r.monster, r.minor?.charm]));
  assert.equal(minors.rotten_golem, 'scavenge');
  assert.ok(Object.values(minors).includes('gut'));
  assert.ok(Object.values(minors).includes('fatal_hold'));
});

test('calibração com a sessão do Infernal Demon reproduz a distribuição de majors que funciona no jogo', () => {
  const infernal = dataset.hunts.find((h) => h.id === 'infernalmdemon-cave');
  const minutes = 11.09;
  const kills = { brachiodemon: (83 / minutes) * 60, infernal_demon: (104 / minutes) * 60, infernal_phantom: (92 / minutes) * 60 };
  const rooms = (5 / minutes) * 60;
  const hours = 15.25 / 60;
  const assigned = {
    freeze: { monster: 'infernal_phantom', tier: 3 },
    divine_wrath: { monster: 'brachiodemon', tier: 3 },
    savage_blow: { monster: 'infernal_demon', tier: 3 },
  };
  const measured = [
    { key: 'freeze', monster: 'infernal_phantom', damagePerHour: 270055 / hours },
    { key: 'divine_wrath', monster: 'brachiodemon', damagePerHour: 269490 / hours },
    { key: 'savage_blow', monster: 'infernal_demon', damagePerHour: 1271024 / hours },
  ];
  const noHit = party.map(({ avgHit, ...rest }) => rest);
  const calibration = calibrate({ dataset, hunt: infernal, killsByMonster: kills, roomsPerHour: rooms, party: noHit, measured, assigned, source: 'teste' });
  assert.ok(calibration.crit > calibration.proc);
  const result = charmPlan({ dataset, hunt: infernal, killsByMonster: kills, roomsPerHour: rooms, lootPcts: [0, 9.8, 4], party: noHit, owned, calibration });
  const majors = Object.fromEntries(result.rows.map((r) => [r.monster, r.major?.charm]));
  assert.deepEqual(majors, { infernal_phantom: 'freeze', infernal_demon: 'savage_blow', brachiodemon: 'divine_wrath' });
});

test('major só entra em criatura com bestiário completo', () => {
  const bestiary = { rotten_golem: 2500, mould_phantom: 2114, branchy_crawler: 2046 };
  const locked = charmPlan({ dataset, hunt, killsByMonster, roomsPerHour: 34.4, lootPcts: [0, 9.8, 4], party, owned, bestiary });
  const byMonster = Object.fromEntries(locked.rows.map((r) => [r.monster, r]));
  assert.ok(byMonster.rotten_golem.major);
  assert.equal(byMonster.mould_phantom.major, null);
  assert.equal(byMonster.branchy_crawler.major, null);
  assert.equal(byMonster.mould_phantom.locked.remaining, 386);
  assert.ok(byMonster.mould_phantom.locked.huntGain > 0);
  assert.ok(locked.damageTotal < plan.damageTotal);
  assert.ok(byMonster.branchy_crawler.minor, 'minors continuam liberados');
});

test('bestiário desconhecido não trava majors', () => {
  const unknown = charmPlan({ dataset, hunt, killsByMonster, roomsPerHour: 34.4, lootPcts: [0, 9.8, 4], party, owned, bestiary: {} });
  assert.ok(unknown.rows.every((r) => !r.locked));
  assert.equal(unknown.damageTotal, plan.damageTotal);
});
