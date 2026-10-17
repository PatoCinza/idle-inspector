import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PARTY_XP_SHARES, PARTY_XP_FACTOR, RISK, partyXpFactor, baseXp, referenceOf, huntRates, roomKills, roomOf,
  offenseOf, defenseOf, partyProtection, recommendHunts, rankHunts, elementMix, castWords,
} from '../src/recommend.js';
import { BOSS_EXP_MULT } from '../src/run.js';
import { renderHunts } from '../src/overlay/hunts-view.js';

const dataset = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url)));
const split = JSON.parse(readFileSync(new URL('./fixtures/xp-split-wandering.json', import.meta.url)));
const hunt = dataset.hunts.find((h) => h.id === 'wanderingpillar-cave');

const party = [
  { name: 'Pato Mago', vocation: 'sorcerer', level: 1300, magicLevel: 170, xpPct: 46, lootPct: 0, protection: { physical: 10, ice: 20, fire: 6 } },
  { name: 'PatoCinza', vocation: 'knight', level: 1193, xpPct: 32, lootPct: 0, protection: { physical: 30 } },
  { name: 'Pato Druida', vocation: 'druid', level: 1204, magicLevel: 140, xpPct: 48, lootPct: 0, protection: { earth: 20 } },
];

const close = (actual, expected, tolerance = 1e-4) => assert.ok(Math.abs(actual - expected) <= tolerance * Math.abs(expected), `${actual} ≉ ${expected}`);

test('cada personagem recebe a parte dele (40% líder, 30% os outros) × 0,99 × (1 + XP%), medido kill a kill', () => {
  const pcts = [split.xpPct.sorcerer, split.xpPct.knight, split.xpPct.druid];
  for (const { monster, xp } of split.kills) {
    const exp = dataset.monsters[monster].exp;
    xp.forEach((amount, i) => close(amount, exp * PARTY_XP_SHARES[3][i] * PARTY_XP_FACTOR * (1 + pcts[i] / 100), 2e-5));
  }
});

test('o boss da sala paga 5× a exp da criatura dele, com o XP% de quem está equipado na hora', () => {
  const exp = dataset.monsters[split.boss.monster].exp * BOSS_EXP_MULT;
  const pcts = [split.xpPct.sorcerer, split.xpPct.knight - split.bossSwap.knight, split.xpPct.druid - split.bossSwap.druid];
  split.boss.xp.forEach((amount, i) => close(amount, exp * PARTY_XP_SHARES[3][i] * PARTY_XP_FACTOR * (1 + pcts[i] / 100), 2e-5));
});

test('o XP Stack da sala é a soma do que cada personagem recebeu', () => {
  assert.equal(split.room.credited.reduce((a, b) => a + b, 0), split.room.stack);
});

test('fator de XP da party pelo XP% lido bate com o medido na Wandering Pillar', () => {
  const [first] = split.kills;
  const measured = first.xp.reduce((a, b) => a + b, 0) / dataset.monsters[first.monster].exp;
  close(partyXpFactor(party), measured, 2e-5);
  assert.equal(partyXpFactor([{ ...party[0], xpPct: undefined }, party[1], party[2]]), null);
  assert.equal(partyXpFactor(null), null);
});

test('exp base soma as kills e o extra do boss por sala', () => {
  const kills = { wandering_pillar: 14, converter: 13 };
  const expected = 14 * dataset.monsters.wandering_pillar.exp + 13 * dataset.monsters.converter.exp + (BOSS_EXP_MULT - 1) * dataset.monsters.wandering_pillar.exp;
  assert.equal(baseXp(dataset, hunt, kills, 1), expected);
});

const window = {
  huntId: hunt.id,
  minutes: 10,
  rooms: 6,
  kills: roomKills(dataset, hunt, 6),
  supply: { 'ultimate mana potion': 2e6 },
  since: null,
};
const combat = {
  members: { sorcerer: { dealt: 13.8e6 }, knight: { dealt: 6.8e6 }, druid: { dealt: 12.2e6 } },
  foes: {},
  taken: { 'Wandering Pillar': { knight: { hits: 100, hp: 1.08e6, mana: 0 } } },
  elements: { ice: 0.4, energy: 0.3, death: 0.2, physical: 0.1 },
};

test('referência guarda o ritmo, o dano sem resistência, o tempo fixo por sala e o fator de XP', () => {
  const reference = referenceOf({ dataset, window, combat, xp: 50e6, t: 1 });
  assert.equal(reference.huntId, hunt.id);
  assert.equal(reference.roomSeconds, 100);
  assert.ok(reference.overheadSeconds > 0 && reference.overheadSeconds < reference.roomSeconds);
  assert.ok(reference.rawDps > 0);
  close(reference.takenPerSecond, 1800);
  close(reference.suppliesPerHour, 12e6);
  close(reference.xpFactor, 50e6 / baseXp(dataset, hunt, window.kills, 6));
  assert.deepEqual(Object.keys(reference.mix).sort(), ['death', 'energy', 'ice', 'physical']);
});

test('sem salas suficientes ou sem combate não há referência', () => {
  assert.equal(referenceOf({ dataset, window: { ...window, rooms: 1 }, combat }), null);
  assert.equal(referenceOf({ dataset, window, combat: { members: {}, foes: {}, taken: {}, elements: {} } }), null);
  assert.equal(referenceOf({ dataset, window: { ...window, minutes: 1 }, combat }), null);
});

test('ritmo vem da medição ao vivo, depois da salva, depois da estimativa', () => {
  const reference = referenceOf({ dataset, window, combat, xp: 0 });
  const saved = { kills: { wandering_pillar: 100 }, rooms: 30 };
  assert.equal(huntRates({ dataset, hunt, live: window, saved, reference }).source, 'live');
  assert.equal(huntRates({ dataset, hunt, live: null, saved, reference }).roomsPerHour, 30);
  const estimated = huntRates({ dataset, hunt, live: null, saved: null, reference });
  assert.equal(estimated.source, 'estimated');
  close(estimated.roomsPerHour, 36);
  assert.equal(huntRates({ dataset, hunt, live: null, saved: null, reference: null }), null);
});

test('hunt mais resistente ao dano da party rende menos salas por hora na estimativa', () => {
  const reference = referenceOf({ dataset, window, combat, xp: 0 });
  const tough = { ...hunt, id: 'tough', bossKey: hunt.bossKey };
  const toughSet = { ...dataset, monsters: Object.fromEntries(Object.entries(dataset.monsters).map(([key, m]) => [key, hunt.monsters.includes(key) ? { ...m, resist: { ice: 50, energy: 50, death: 50, physical: 50 } } : m])) };
  const rooms = huntRates({ dataset: toughSet, hunt: tough, live: null, saved: null, reference }).roomsPerHour;
  assert.ok(rooms < 36);
});

test('ataque escolhe o elemento de menor resistência média e a rotação de cada personagem', () => {
  const offense = offenseOf({ dataset, hunt, members: party, mix: { ice: 1 } });
  const lowest = Math.min(...Object.values(offense.resist));
  assert.equal(offense.best[0].resist, lowest);
  const druid = offense.members.find((m) => m.vocation === 'druid');
  assert.deepEqual(druid.spells.map((spell) => spell.role), ['ultimate', 'ultimate', 'fork', 'rune']);
  const knight = offense.members.find((m) => m.vocation === 'knight');
  assert.ok(knight.spells.every((spell) => dataset.spells.find((s) => s.name === spell.name).type === 'area'));
  assert.ok(offense.efficiency > 0 && offense.efficiency <= 1);
});

test('magia de especialização só entra se o personagem já foi visto usando', () => {
  const sorcerer = [party[0]];
  const names = (cast) => offenseOf({ dataset, hunt, members: sorcerer, mix: null, cast }).members[0].spells.map((s) => s.name);
  assert.ok(!names({}).includes('Death Nova'));
  const cast = castWords({ members: { sorcerer: { mobs: { spells: { 'exevo gran mas mort': { casts: 1 } } } } } });
  assert.ok(cast.sorcerer.has('exevo gran mas mort'));
});

test('defesa compara o dano da hunt com o da referência depois das proteções', () => {
  const reference = referenceOf({ dataset, window, combat, xp: 0 });
  const protection = partyProtection(party);
  const own = defenseOf({ dataset, hunt, protection, reference });
  close(own.ratio, 1);
  assert.equal(own.risk, 'ok');
  close(own.takenPerSecond, reference.takenPerSecond);
  const harder = dataset.hunts.find((h) => h.id === 'radiant-skyhold-devoted');
  const radiant = defenseOf({ dataset, hunt: harder, protection, reference });
  assert.ok(radiant.ratio > 1);
  assert.ok(['caution', 'risky'].includes(radiant.risk));
  assert.equal(defenseOf({ dataset, hunt, protection, reference: null }).risk, null);
});

test('proteção média da party por elemento', () => {
  const protection = partyProtection(party);
  close(protection.physical, (10 + 30 + 0) / 3);
  assert.equal(partyProtection(null).ice, 0);
});

test('ranking põe as arriscadas e as sem ritmo no fim e respeita o objetivo', () => {
  const row = (id, group, xp, profit) => ({ hunt: { id }, group, xpPerHour: xp, profitPerHour: profit });
  const rows = [row('a', 'risky', 900, 900), row('b', 'ok', 100, 300), row('c', 'caution', 200, 100), row('d', 'unrated', null, null)];
  assert.deepEqual(rankHunts(rows, 'xp').map((r) => r.hunt.id), ['c', 'b', 'a', 'd']);
  assert.deepEqual(rankHunts(rows, 'profit').map((r) => r.hunt.id), ['b', 'c', 'a', 'd']);
});

test('recomendação cobre as hunts liberadas e marca a atual e a referência', () => {
  const reference = referenceOf({ dataset, window, combat, xp: 50e6, t: 1 });
  const table = recommendHunts({ dataset, live: window, reference, party, combat, objective: 'xp', liveXp: 50e6 });
  assert.equal(table.rows.length, dataset.hunts.filter((h) => (h.avail ?? 'on') === 'on').length);
  assert.equal(table.xpSource, 'measured');
  const current = table.rows.find((r) => r.current);
  assert.equal(current.hunt.id, hunt.id);
  assert.equal(current.rates.source, 'live');
  assert.ok(table.rows.filter((r) => !r.current).every((r) => r.rates.source === 'estimated'));
  assert.ok(table.rows.every((r) => r.xpPerHour > 0));
});

test('sem referência nem party, as hunts ficam sem ritmo e o XP é a base', () => {
  const table = recommendHunts({ dataset, objective: 'profit' });
  assert.equal(table.xpSource, null);
  assert.ok(table.rows.every((r) => r.group === 'unrated' && r.xpPerHour === null));
});

test('mistura de elementos vira fração do dano', () => {
  assert.deepEqual(elementMix({ ice: 30, fire: 10 }), { ice: 0.75, fire: 0.25 });
  assert.deepEqual(elementMix({}), {});
});

test('sala tem as 52 criaturas e o boss com 3× o HP', () => {
  const room = roomOf(dataset, hunt);
  assert.equal(room.filter((c) => !c.boss).reduce((a, c) => a + c.kills, 0), 52);
  const boss = room.find((c) => c.boss);
  assert.equal(boss.hp, dataset.monsters[hunt.bossKey].hp * dataset.bossWave.hpMult);
});

test('aba Hunts mostra o objetivo, a referência, as fontes e a defesa', () => {
  const reference = referenceOf({ dataset, window, combat, xp: 50e6, t: Date.UTC(2026, 9, 16, 20) });
  const html = renderHunts(recommendHunts({ dataset, live: window, reference, party, combat, objective: 'profit', liveXp: 50e6 }));
  assert.match(html, /data-hunt-objective="profit"/);
  assert.match(html, /class="tab active" data-hunt-objective="profit"/);
  assert.match(html, /Referência: Wandering Pillar/);
  assert.match(html, /ao vivo/);
  assert.match(html, /estimado/);
  assert.match(html, /pill (good|warn|bad)/);
  assert.ok(RISK.caution < RISK.risky);
  const empty = renderHunts(recommendHunts({ dataset, objective: 'xp' }));
  assert.match(empty, /Sem hunt de referência/);
  assert.match(empty, /Party não lida/);
});

test('imbuements: proteção para os elementos que mais pesam e dano elemental só para quem usa arma e quando rende', async () => {
  const { imbuementsOf, MIN_PROTECTION_SHARE, MIN_DAMAGE_GAIN } = await import('../src/recommend.js');
  const offense = { resist: { physical: 20, fire: -10, ice: 30, energy: 0, earth: 0, holy: 0, death: 0 } };
  const defense = { incoming: 100, byElement: { physical: 50, fire: 30, death: 15, ice: 5 } };
  const knight = [{ vocation: 'knight' }, { vocation: 'druid' }];
  const result = imbuementsOf({ dataset, offense, defense, members: knight });
  assert.deepEqual(result.protection.map((p) => p.key), ['dragonhide', 'lichshroud']);
  assert.ok(result.protection.every((p) => p.share >= MIN_PROTECTION_SHARE));
  assert.equal(Math.round(result.protection[0].reduction * 1000), Math.round(0.3 * 0.15 * 1000));
  assert.equal(result.damage.key, 'scorch');
  assert.ok(result.damage.gain >= MIN_DAMAGE_GAIN);
  assert.deepEqual(result.damage.vocations, ['knight']);
  assert.equal(imbuementsOf({ dataset, offense, defense, members: [{ vocation: 'druid' }] }).damage, null);
  const physicalBest = { resist: { ...offense.resist, physical: -30 } };
  assert.equal(imbuementsOf({ dataset, offense: physicalBest, defense, members: knight }).damage, null);
});

test('aba Hunts mostra a coluna de imbuements', () => {
  const reference = referenceOf({ dataset, window, combat, xp: 50e6, t: 1 });
  const html = renderHunts(recommendHunts({ dataset, live: window, reference, party, combat, objective: 'xp', liveXp: 50e6 }));
  assert.match(html, /<th>Imbuements<\/th>/);
  assert.match(html, /Dragon Hide|Lich Shroud|Snake Skin|Quara Scale|Cloud Fabric|Demon Presence/);
});
