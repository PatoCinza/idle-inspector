import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rotationTable, castMoments, welchMoments, expectedRatio, monsterLookup, fillerOf, roomGroups } from '../src/rotation-table.js';
import { spellIndex } from '../src/spells.js';

const dataset = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url)));
const rotation = JSON.parse(readFileSync(new URL('./fixtures/rotation-stats-bloated.json', import.meta.url)));
const mage = { name: 'Pato Mago', vocation: 'sorcerer', level: 974, magicLevel: 168, spellDmgPct: 115.579, critChance: 24.472, critDmg: 153.534 };

const table = rotationTable({ dataset, rotation, party: [mage] });
const memberOf = (voc) => table.members.find((member) => member.voc === voc);
const compareOf = (voc, name) => memberOf(voc).compare.items.find((item) => item.name === name);

test('momentos por cast: média e variância a partir de soma e soma dos quadrados', () => {
  assert.deepEqual(castMoments({ casts: 3, dealt: 30, sq: 10 ** 2 + 20 ** 2 + 0 }), { n: 3, mean: 10, variance: 100 });
  assert.ok(Number.isNaN(castMoments({ casts: 1, dealt: 5, sq: 25 }).variance));
  const diff = welchMoments({ n: 10, mean: 100, variance: 25 }, { n: 10, mean: 110, variance: 25 });
  assert.equal(diff.diff, 10);
  assert.ok(diff.low > 0 && diff.high < 20);
});

test('Bloated: a reserva de cada personagem é a magia de cooldown igual ao global mais lançada', () => {
  assert.equal(memberOf('sorcerer').compare.filler.name, 'Thunderstorm');
  assert.equal(memberOf('druid').compare.filler.name, 'Avalanche');
  assert.equal(memberOf('knight').compare.filler.name, 'Berserk');
});

test('Bloated: Death Echo e Forked Glacier empatam com a runa; amp kor rende menos que o Berserk', () => {
  const echo = compareOf('sorcerer', 'Death Echo');
  assert.equal(echo.verdict, 'tie');
  assert.equal(echo.rooms, 4);
  assert.ok(echo.diff < 0 && echo.high > 0);
  assert.equal(compareOf('druid', 'Forked Glacier').verdict, 'tie');
  assert.equal(compareOf('knight', "Executioner's Throw").verdict, 'less');
  assert.equal(compareOf('sorcerer', 'Rage of the Skies').verdict, 'more');
});

test('comparação usa só as salas em que as duas magias foram lançadas', () => {
  const echo = compareOf('sorcerer', 'Death Echo');
  const shared = rotation.rooms.filter((room) => room.spells.sorcerer['exevo mort ora']);
  const thunder = shared.reduce((acc, room) => ({ casts: acc.casts + room.spells.sorcerer['adori mas vis'].casts, dealt: acc.dealt + room.spells.sorcerer['adori mas vis'].dealt }), { casts: 0, dealt: 0 });
  assert.equal(Math.round(echo.fillerPerCast), Math.round(thunder.dealt / thunder.casts));
});

test('esperado por golpe usa a fórmula, o Dano de magia do painel e a resistência de cada criatura', () => {
  const monsterOf = monsterLookup(dataset);
  const echo = dataset.spells.find((spell) => spell.words === 'exevo mort ora');
  const normal = { 'Bloated Man-Maggot': { hits: 10, dealt: 10000, sq: 10 * 1000 ** 2 }, 'Sopping Corpus Boss': { hits: 10, dealt: 10000, sq: 10 * 1000 ** 2 } };
  const result = expectedRatio({ spell: echo, member: { level: 1000, magicLevel: 100, spellDmgPct: 100 }, normal, monsterOf });
  assert.equal(result.base, 522 * 2);
  assert.equal(Math.round(result.expectedPerHit), Math.round(1044 * (0.95 + 0.9) / 2));
  assert.equal(result.hits, 20);
  assert.ok(result.low < result.ratio && result.ratio < result.high);
  assert.equal(expectedRatio({ spell: echo, member: { level: 1000 }, normal, monsterOf }), null);
});

test('Bloated: medido/esperado só aparece para quem tem level e magic level lidos', () => {
  const thunder = memberOf('sorcerer').spells.find((row) => row.name === 'Thunderstorm');
  assert.ok(thunder.expected.ratio > 1);
  assert.equal(memberOf('druid').spells[0].expected, null);
  assert.equal(memberOf('druid').formulaReady, false);
});

test('linhas da magia trazem participação, eco, crítico e casts por minuto', () => {
  const sorcerer = memberOf('sorcerer');
  const echo = sorcerer.spells.find((row) => row.name === 'Death Echo');
  assert.equal(echo.casts, 42);
  assert.equal(Math.round(echo.echoShare * 100), 39);
  assert.ok(echo.crit.rate > 0 && echo.crit.multiplier > 2);
  assert.equal(sorcerer.loose.find((row) => row.source === 'auto').label, 'Ataque básico');
  assert.ok(Math.abs(sum(sorcerer.spells.map((row) => row.share)) + sum(sorcerer.loose.map((row) => row.share)) - 1) < 1e-9);
});

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

test('salas agrupadas pela rotação usada, com a diferença para o grupo mais medido', () => {
  const groups = roomGroups({ rooms: rotation.rooms, index: spellIndex(dataset.spells) });
  assert.equal(groups.length, 2);
  assert.ok(groups[0].isBase);
  assert.deepEqual(groups[1].changes, [{ voc: 'druid', changes: ['−Forked Glacier'] }, { voc: 'sorcerer', changes: ['+Death Echo'] }]);
  assert.ok(groups[1].vsBase.low < 0 && groups[1].vsBase.high > 0);
});

test('fillerOf ignora magias com poucos casts e período sem dados deixa a tabela vazia', () => {
  assert.equal(fillerOf([{ cd: 2000, casts: 2 }]), null);
  assert.equal(rotationTable({ dataset, rotation, party: [], period: 'boss' }).ready, false);
  assert.equal(rotationTable({ dataset, rotation: null, party: null }).ready, false);
});
