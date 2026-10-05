import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCapture } from '../src/capture/hook.js';
import { mergeRotation } from '../src/rotation.js';
import { roomData, patchFrame } from './support/msgpack.js';

const setup = () => {
  const events = [];
  const capture = createCapture({ emit: (event) => events.push(event), now: () => 1234 });
  return { capture, events };
};

test('patch com bestiário e loot vira um snapshot', () => {
  const { capture, events } = setup();
  capture.incoming(patchFrame(15, JSON.stringify({ 'h:troll-cave': 3, troll: 40 }), JSON.stringify({ 'gold coin': { n: 9, g: 9 } })));
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'snapshot');
  assert.equal(events[0].t, 1234);
  assert.equal(events[0].bestiary.troll, 40);
  assert.equal(events[0].loot['gold coin'].n, 9);
});

test('patch sem nada reconhecido não emite', () => {
  const { capture, events } = setup();
  capture.incoming(patchFrame(15, JSON.stringify({ hp: { n: 1 }, mana: { n: 2 } })));
  assert.deepEqual(events, []);
});

test('mensagem charms emite os slots', () => {
  const { capture, events } = setup();
  capture.incoming(roomData('charms', { slots: { 14: { tier: 3, monsterKey: 'troll' } } }));
  assert.deepEqual(events, [{ type: 'charms', slots: { 14: { tier: 3, monsterKey: 'troll' } }, t: 1234 }]);
});

test('mensagens que não interessam são ignoradas', () => {
  const { capture, events } = setup();
  capture.incoming(roomData('fx', [{ t: 'atk' }]));
  capture.incoming(roomData('log', { text: 'oi' }));
  assert.deepEqual(events, []);
});

test('charmstats vira o Charm Analyzer sem ler o DOM', () => {
  const { capture, events } = setup();
  capture.incoming(roomData('charmstats', { ms: 90155, rows: [{ id: 3, n: 15, v: 34988 }, { id: 19, n: 0, v: 96643 }] }));
  capture.incoming(roomData('charmstats', { ms: 0, rows: [] }));
  assert.deepEqual(events, [{ type: 'charmStats', stats: { ms: 90155, rows: [{ id: 3, n: 15, v: 34988 }, { id: 19, n: 0, v: 96643 }] }, t: 1234 }]);
});

const hit = (voc, amount) => ({ k: 'dealt', voc, foe: { kind: 'mob', name: 'Troll' }, amount, el: 'physical', crit: false, fatal: false, killed: false });

test('combatlog é agregado em lotes de 5 s sem perder golpes', () => {
  let clock = 0;
  const events = [];
  const capture = createCapture({ emit: (event) => events.push(event), now: () => clock });
  [[0, 10], [1000, 20], [3000, 30], [5000, 40], [6000, 50]].forEach(([t, amount]) => { clock = t; capture.incoming(roomData('combatlog', [hit('knight', amount)])); });
  assert.deepEqual(events.filter((e) => e.type === 'combat').map((e) => [e.t, e.combat.members.knight]), [[0, { hits: 1, dealt: 10, crits: 0, critDealt: 0 }], [5000, { hits: 3, dealt: 90, crits: 0, critDealt: 0 }]]);
});

test('combatlog sem dano causado não emite', () => {
  const { capture, events } = setup();
  capture.incoming(roomData('combatlog', [{ k: 'potion', voc: 'druid', amount: 800, mana: true }]));
  assert.deepEqual(events, []);
});

const procstats = (ms) => roomData('procstats', {
  ms,
  party: 1,
  rows: [{ k: 'transcendence', n: 1, v: 15000, by: [{ name: 'Pato Mago', vocation: 'sorcerer', n: 1, v: 15000 }] }],
});

test('procstats emite o tempo em avatar de cada membro', () => {
  const { capture, events } = setup();
  capture.incoming(procstats(60000));
  assert.deepEqual(events, [{ type: 'procs', procs: { ms: 60000, avatar: [{ name: 'Pato Mago', vocation: 'sorcerer', ms: 15000 }] }, t: 1234 }]);
});

test('procstats chega várias vezes por segundo e é emitido no máximo a cada 5 s', () => {
  let clock = 0;
  const events = [];
  const capture = createCapture({ emit: (event) => events.push(event), now: () => clock });
  [0, 1000, 4999, 5000, 9000, 10000].forEach((t) => { clock = t; capture.incoming(procstats(t + 1)); });
  assert.deepEqual(events.map((e) => e.t), [0, 5000, 10000]);
});

test('resetstats do Hunt Analyzer e do Loot Analyser zera o loot da janela', () => {
  const { capture, events } = setup();
  capture.outgoing(roomData('resetstats', { panel: 'hunt' }));
  capture.outgoing(roomData('resetstats', { panel: 'loot' }));
  assert.deepEqual(events.map((e) => [e.type, e.reason, e.loot]), [['reset', 'analyzer', {}], ['reset', 'analyzer', {}]]);
});

test('resetstats de outros painéis não reinicia a janela', () => {
  const { capture, events } = setup();
  capture.outgoing(roomData('resetstats', { panel: 'charman' }));
  capture.outgoing(roomData('resetstats', { panel: 'procan' }));
  assert.deepEqual(events, []);
});

test('stage reinicia a janela e informa a hunt nova', () => {
  const { capture, events } = setup();
  capture.outgoing(roomData('stage', { huntId: 'rottengolem-cave' }));
  assert.deepEqual(events, [{ type: 'reset', reason: 'hunt', huntId: 'rottengolem-cave', t: 1234 }]);
});

test('mensagens enviadas de outros tipos e frames não ROOM_DATA são ignorados', () => {
  const { capture, events } = setup();
  capture.outgoing(roomData('cpong'));
  capture.outgoing(Uint8Array.of(10, 1, 2));
  assert.deepEqual(events, []);
});

test('frame malformado não derruba a captura', () => {
  const { capture, events } = setup();
  capture.incoming(Uint8Array.of(13, 0xc1));
  assert.deepEqual(events.map((e) => e.type), ['error']);
});

test('cpong real enviado pelo cliente não gera evento nem erro', () => {
  const { capture, events } = setup();
  capture.outgoing(Uint8Array.from('0d a5 63 70 6f 6e 67 d4 72 40 91 a1 74 cb 42 7a 0f 4b 34 d6 b0 00'.split(' ').map((h) => parseInt(h, 16))));
  assert.deepEqual(events, []);
});

test('patch com o Supply Analyser vira snapshot com o gasto por item', () => {
  const { capture, events } = setup();
  capture.incoming(patchFrame(15, JSON.stringify({ 'ultimate mana potion': { n: 3, g: 1464 }, Thunderstorm: { n: 1, g: 52 } })));
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'snapshot');
  assert.equal(events[0].supply['ultimate mana potion'].g, 1464);
  assert.equal(events[0].loot, null);
});

test('xp dos efeitos visuais é somada em lotes de 5 s', () => {
  let clock = 0;
  const events = [];
  const capture = createCapture({ emit: (event) => events.push(event), now: () => clock });
  const fx = (amounts) => roomData('fx', [...amounts.map((amount) => ({ t: 'xp', x: 1, y: 1, amount })), { t: 'gold', x: 1, y: 1, amount: 999 }]);
  [[0, [10, 20]], [2000, [30]], [5000, [40]], [7000, [5]]].forEach(([t, amounts]) => { clock = t; capture.incoming(fx(amounts)); });
  assert.deepEqual(events.map((e) => [e.t, e.xp]), [[0, 30], [5000, 70]]);
  capture.incoming(roomData('fx', { t: 'hit', x: 1, y: 1, amount: 50 }));
  assert.equal(events.length, 2);
});

test('notify de fase concluída emite o tempo da sala; outros notify não', () => {
  const { capture, events } = setup();
  capture.incoming(roomData('notify', { kind: 'phase', text: '{name} concluída!', params: { ms: 41250, name: 'Infernal Demon' } }));
  capture.incoming(roomData('notify', { kind: 'wave', text: 'Wave {n}/{total} concluída!', params: { n: 1, total: 10 } }));
  assert.deepEqual(events, [{ type: 'phase', ms: 41250, t: 1234 }]);
});

test('configuração de loot vira evento com a lista de "Não coletar"', () => {
  const { capture, events } = setup();
  capture.incoming(patchFrame(15, JSON.stringify({ tiers: [], classes: [], skip: ['serpent sword', 'devil helmet#2', 7], noSell: [], codexOnly: false })));
  assert.deepEqual(events, [{ type: 'lootConfig', config: { skip: ['serpent sword', 'devil helmet#2'], codexOnly: false }, t: 1234 }]);
});

const rotationSpells = JSON.parse(readFileSync(new URL('../data/spells.json', import.meta.url))).spells;
const rotationFixture = JSON.parse(readFileSync(new URL('./fixtures/rotation-bloated.json', import.meta.url)));

test('cast, dano e eco viram eventos de rotação em lotes de 5 s', () => {
  let clock = 0;
  const events = [];
  const capture = createCapture({ emit: (event) => events.push(event), now: () => clock, spells: rotationSpells });
  rotationFixture.frames.forEach(({ dt, type, payload }) => { clock = dt; capture.incoming(roomData(type, payload)); });
  clock = 9000;
  capture.incoming(roomData('combatlog', [{ k: 'dealt', voc: 'knight', foe: { kind: 'mob', name: 'Troll' }, amount: 5, el: 'physical', crit: false }]));
  const rotation = events.filter((event) => event.type === 'rotation');
  assert.deepEqual(rotation.map((event) => event.t), [0, 9000]);
  const total = rotation.map((event) => event.stats).reduce((a, b) => mergeRotation(a, b));
  assert.equal(total.members.sorcerer.mobs.spells['exevo mort ora'].echo, 40880);
  assert.equal(total.members.knight.mobs.spells['exori amp kor'].casts, 1);
});

test('sem a tabela de magias, a captura continua e não quebra nada', () => {
  const { capture, events } = setup();
  capture.incoming(roomData('fx', [{ t: 'cd', slot: 2, words: 'exevo mort ora', group: 'attack' }]));
  capture.incoming(roomData('notify', { kind: 'wave', params: { n: 3, total: 10 } }));
  assert.deepEqual(events.filter((event) => event.type === 'error'), []);
});
