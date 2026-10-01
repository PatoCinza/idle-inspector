import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  charmPlan, creatureWeights, damageGain, normalizeParty, calibrate, DEFAULT_CALIBRATION,
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

test('com crítico alto o Savage Blow entra no plano', () => {
  assert.ok(plan.rows.some((r) => r.major?.charm === 'savage_blow'));
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
  assert.ok(byMonster.mould_phantom.locked.value > 0);
  assert.ok(locked.damageTotal < plan.damageTotal);
  assert.ok(byMonster.branchy_crawler.minor, 'minors continuam liberados');
});

test('bestiário desconhecido não trava majors', () => {
  const unknown = charmPlan({ dataset, hunt, killsByMonster, roomsPerHour: 34.4, lootPcts: [0, 9.8, 4], party, owned, bestiary: {} });
  assert.ok(unknown.rows.every((r) => !r.locked));
  assert.equal(unknown.damageTotal, plan.damageTotal);
});

test('dano medido por criatura substitui a estimativa pelo HP nos pesos', () => {
  const w = creatureWeights({ dataset, hunt, killsByMonster, roomsPerHour: 34.4, dealtPerHour: { rotten_golem: 100, mould_phantom: 300, branchy_crawler: 600 } });
  assert.deepEqual(w, { rotten_golem: 0.1, mould_phantom: 0.3, branchy_crawler: 0.6 });
});

test('crítico multiplica por 1,5 + o Dano crítico do painel', () => {
  const [member] = normalizeParty([{ ...party[0], critDmg: 88.534 }]);
  assert.ok(Math.abs(member.critMultiplier - 2.38534) < 1e-9);
});

test('fração do dano em crítico medida no combate define o crítico efetivo', () => {
  const [estimated] = normalizeParty([party[0]]);
  const [measured] = normalizeParty([{ ...party[0], critShare: 80 }]);
  assert.ok(Math.abs(estimated.ecc - (0.36 + 0.64 * 0.17572)) < 1e-9);
  assert.equal(measured.critShare, 0.8);
  const m = measured.critMultiplier;
  assert.ok(Math.abs((measured.ecc * m) / (1 + measured.ecc * (m - 1)) - 0.8) < 1e-9);
});

test('Savage Blow soma o valor do charm ao multiplicador do crítico', () => {
  const sorcerer = { level: 959, critChance: 24.472, critDmg: 153.534, avgHit: 9000, critShare: 80.4 };
  const members = normalizeParty([sorcerer]);
  const gain = damageGain({ dataset, charmKey: 'savage_blow', tier: 3, monsterKey: 'bloated_man_maggot', party: members });
  assert.ok(Math.abs(gain - (0.804 * 0.44) / (1.5 + 1.53534)) < 1e-9);
});

test('Savage Blow previsto bate com a sessão do Bloated Man-Maggot de 01/10', () => {
  const members = normalizeParty([
    { name: 'Pato Mago', critDmg: 153.534, critShare: 80.4, dealt: 2028004, avgHit: 9000 },
    { name: 'Pato Druida', critDmg: 88.534, critShare: 62.7, dealt: 1385655, avgHit: 6000 },
    { name: 'PatoCinza', critDmg: 125.034, critShare: 54.9, dealt: 650956, avgHit: 1500 },
  ]);
  const gain = damageGain({ dataset, charmKey: 'savage_blow', tier: 3, monsterKey: 'bloated_man_maggot', party: members, calibration: DEFAULT_CALIBRATION });
  const savage = 109288;
  const observed = savage / (1086246 - savage);
  assert.ok(Math.abs(gain / observed - 1) < 0.05);
});

test('Fatal Hold só aumenta o dano que tira os últimos 25% do HP, sem overkill', () => {
  const members = normalizeParty([party[0]]);
  const gain = damageGain({ dataset, charmKey: 'fatal_hold', tier: 3, monsterKey: 'sopping_corpus', party: members });
  const extra = (0.25 * 0.2) / 1.2;
  assert.ok(Math.abs(gain - extra / (1 - extra)) < 1e-9);
});

test('Fatal Hold previsto bate com as sessões do Bloated Man-Maggot de 01/10', () => {
  const members = normalizeParty([party[0]]);
  const gain = damageGain({ dataset, charmKey: 'fatal_hold', tier: 3, monsterKey: 'sopping_corpus', party: members, calibration: DEFAULT_CALIBRATION });
  const sessions = [
    { fatalHold: 48346, zap: 39962, sopping: 1184765 },
    { fatalHold: 34685, zap: 35688, sopping: 759690 },
  ];
  const observed = sessions.map((s) => s.fatalHold / (s.sopping - s.fatalHold - s.zap));
  const mean = observed.reduce((a, b) => a + b, 0) / observed.length;
  assert.ok(Math.abs(mean / gain - 1) < 0.1);
});

test('calibração mede cada família separada e desconta o dano dos charms da criatura', () => {
  const maggot = dataset.hunts.find((h) => h.id === 'bloatedmanmaggot-cave');
  const members = [{ level: 900, critChance: 20, critDmg: 100, avgHit: 5000 }];
  const fatal = damageGain({ dataset, charmKey: 'fatal_hold', tier: 3, monsterKey: 'sopping_corpus', party: normalizeParty(members) });
  const base = 1000000;
  const dealtPerHour = { sopping_corpus: base * (1 + 2 * fatal) };
  const calibration = calibrate({
    dataset,
    hunt: maggot,
    killsByMonster: {},
    roomsPerHour: 0,
    dealtPerHour,
    party: members,
    measured: [{ key: 'fatal_hold', monster: 'sopping_corpus', damagePerHour: base * 2 * fatal }],
    assigned: { fatal_hold: { monster: 'sopping_corpus', tier: 3 } },
    source: 'teste',
  });
  assert.ok(Math.abs(calibration.fatal - 2) < 1e-9);
  assert.equal(calibration.proc, DEFAULT_CALIBRATION.proc);
  assert.equal(calibration.crit, DEFAULT_CALIBRATION.crit);
});

test('procs elementais não usam o crítico do painel', () => {
  const base = { name: 'm', level: 900, maxHp: 5000, maxMana: 30000, critChance: 0, critDmg: 0, avgHit: 3000, dealt: 1 };
  const gainWith = (member) => damageGain({ dataset, charmKey: 'freeze', tier: 3, monsterKey: hunt.monsters[0], party: normalizeParty([member]) });
  assert.equal(gainWith({ ...base, critChance: 50, critDmg: 150 }), gainWith(base));
});
