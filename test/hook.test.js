import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCapture } from '../src/capture/hook.js';
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
  capture.incoming(roomData('charmstats', { ms: 10, rows: [] }));
  assert.deepEqual(events, []);
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
