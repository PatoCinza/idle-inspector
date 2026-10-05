import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAttribution, initialAttribution, inputsFromMessage, addRecords, mergeRotation, hasRotation, rotationOfRoom, EMPTY_ROTATION, TICK_MS } from '../src/rotation.js';

const { spells } = JSON.parse(readFileSync(new URL('../data/spells.json', import.meta.url)));
const fixture = JSON.parse(readFileSync(new URL('./fixtures/rotation-bloated.json', import.meta.url)));

const replay = (frames, start = 0) => {
  const attribute = createAttribution(spells);
  return frames.reduce(({ state, stats }, frame) => {
    const step = attribute(state, inputsFromMessage(frame.type, frame.payload), start + frame.dt);
    return { state: step.state, stats: addRecords(stats, step.records) };
  }, { state: initialAttribution(), stats: EMPTY_ROTATION });
};

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

const closing = { dt: 9000, type: 'fx', payload: [{ t: 'cd', slot: 2, words: 'exura vita', group: 'heal' }] };

test('recorte real: cast e dano chegam no mesmo tick e o eco do Death Echo entra na magia', () => {
  const { stats } = replay([...fixture.frames, closing]);
  const sorcerer = stats.members.sorcerer.mobs;
  const echo = sorcerer.spells['exevo mort ora'];
  assert.equal(echo.casts, 1);
  assert.equal(echo.dealt, sum([7971, 6549, 6316, 6662, 6160, 7027]) + sum([7811, 6567, 7862, 6876, 4946, 6818]));
  assert.equal(echo.echo, sum([7811, 6567, 7862, 6876, 4946, 6818]));
  assert.equal(echo.hits, 12);
  assert.equal(echo.crits, 12);
  assert.equal(sorcerer.spells['exevo gran mas flam'].dealt, sum([23193, 23498, 34729, 21307, 24929]));
  assert.deepEqual(sorcerer.loose.auto, { hits: 1, dealt: 2378, crits: 1 });
  assert.deepEqual(sorcerer.loose.other, { hits: 2, dealt: 5002, crits: 0 });
});

test('recorte real: magia de knight leva o dano físico e o do elemento da arma; ataque básico separado', () => {
  const { stats } = replay([...fixture.frames, closing]);
  const knight = stats.members.knight.mobs;
  assert.equal(knight.spells['exori amp kor'].dealt, sum([1, 2256, 1, 1792, 21, 2220]));
  assert.deepEqual(knight.loose.auto, { hits: 2, dealt: 2355, crits: 0 });
  assert.equal(stats.members.druid.mobs.spells['exevo gran mas tera'].dealt, sum([4424, 2605, 2520, 3615, 3151, 3076]));
});

test('golpe sem crítico guarda soma e quadrado por criatura; o crítico fica fora', () => {
  const { stats } = replay([...fixture.frames, closing]);
  const wrath = stats.members.druid.mobs.spells['exevo gran mas tera'];
  assert.deepEqual(wrath.normal['Sopping Corpus'], { hits: 2, dealt: 3151 + 3076, sq: 3151 ** 2 + 3076 ** 2 });
  assert.deepEqual(stats.members.sorcerer.mobs.spells['exevo mort ora'].normal, {});
});

test('tempo conta só entre mensagens de combate', () => {
  const { stats } = replay(fixture.frames);
  assert.equal(stats.time.mobs, 2126);
});

const cast = (slot, words, dt) => ({ dt, type: 'fx', payload: [{ t: 'cd', slot, words, group: 'attack' }] });
const hit = (voc, amount, el, dt, crit = false) => ({ dt, type: 'combatlog', payload: [{ k: 'dealt', voc, foe: { kind: 'mob', name: 'Troll' }, amount, el, crit }] });
const atk = (slot, dt) => ({ dt, type: 'fx', payload: [{ t: 'atk', memberId: slot }] });
const wave = (n, dt) => ({ dt, type: 'notify', payload: { kind: 'wave', params: { n, total: 10 } } });
const room = (ms, dt) => ({ dt, type: 'notify', payload: { kind: 'phase', params: { ms } } });

test('runa de várias vocações aprende o slot pela magia exclusiva ou pelo primeiro golpe', () => {
  const learned = replay([cast(2, 'adori mas vis', 0), hit('sorcerer', 300, 'energy', 1), cast(2, 'adori mas vis', 2000), hit('sorcerer', 400, 'energy', 2001), closing]).stats;
  assert.equal(learned.members.sorcerer.mobs.spells['adori mas vis'].casts, 2);
  assert.equal(learned.members.sorcerer.mobs.spells['adori mas vis'].dealt, 700);
});

test('elemento diferente do da magia no tick do cast vira proc; fora do tick, outros', () => {
  const { stats } = replay([cast(2, 'adori mas vis', 0), hit('sorcerer', 300, 'energy', 1), hit('sorcerer', 50, 'earth', 2), hit('sorcerer', 60, 'earth', TICK_MS + 100), closing]);
  assert.deepEqual(stats.members.sorcerer.mobs.loose, { proc: { hits: 1, dealt: 50, crits: 0 }, other: { hits: 1, dealt: 60, crits: 0 } });
});

test('golpe da wand no tick do ataque básico não vira eco, mesmo dentro da janela', () => {
  const { stats } = replay([cast(2, 'exevo mort ora', 0), hit('sorcerer', 2000, 'death', 1), atk(2, 1990), hit('sorcerer', 590, 'death', 1991), hit('sorcerer', 2100, 'death', 2060), closing]);
  const echo = stats.members.sorcerer.mobs.spells['exevo mort ora'];
  assert.equal(echo.echo, 2100);
  assert.deepEqual(stats.members.sorcerer.mobs.loose.auto, { hits: 1, dealt: 590, crits: 0 });
});

test('a onda do boss muda o período e a sala fecha com a rotação usada nas ondas', () => {
  const frames = [
    room(100000, 0),
    cast(2, 'exevo gran mas vis', 10), hit('sorcerer', 1000, 'energy', 11),
    wave(9, 500),
    cast(2, 'adori gran mort', 600), hit('sorcerer', 5000, 'death', 601),
    room(98000, 900),
    closing,
  ];
  const { stats } = replay(frames);
  assert.equal(stats.members.sorcerer.mobs.spells['exevo gran mas vis'].dealt, 1000);
  assert.equal(stats.members.sorcerer.boss.spells['adori gran mort'].dealt, 5000);
  assert.deepEqual(stats.rooms, [{ ms: 98000, spells: { sorcerer: { 'exevo gran mas vis': { casts: 1, dealt: 1000, sq: 1e6 } } } }]);
  assert.deepEqual(rotationOfRoom(stats.rooms[0]), { sorcerer: ['exevo gran mas vis'] });
});

test('a primeira sala depois de abrir o jogo não entra, porque o começo dela não foi visto', () => {
  const { stats } = replay([cast(2, 'exevo gran mas vis', 0), hit('sorcerer', 1, 'energy', 1), room(90000, 100)]);
  assert.deepEqual(stats.rooms, []);
});

test('mergeRotation soma lotes e hasRotation ignora lote só com tempo', () => {
  const a = addRecords(EMPTY_ROTATION, [{ r: 'cast', voc: 'druid', words: 'exori', period: 'mobs', dealt: 10, hits: 1, crits: 0, critDealt: 0, echo: 0, normal: { Troll: { hits: 1, dealt: 10, sq: 100 } } }]);
  const merged = mergeRotation(a, a);
  assert.deepEqual(merged.members.druid.mobs.spells.exori, { casts: 2, dealt: 20, sq: 200, hits: 2, crits: 0, critDealt: 0, echo: 0, normal: { Troll: { hits: 2, dealt: 20, sq: 200 } } });
  assert.ok(hasRotation(a));
  assert.ok(!hasRotation(addRecords(EMPTY_ROTATION, [{ r: 'time', period: 'mobs', ms: 5 }])));
});
