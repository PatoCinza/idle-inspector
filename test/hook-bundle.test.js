import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildExtension } from '../scripts/build-extension.js';
import { TAG } from '../src/capture/protocol.js';
import { roomData, patchFrame } from './support/msgpack.js';

let outDir;
let source;

before(async () => {
  outDir = await mkdtemp(join(tmpdir(), 'blp-hook-'));
  await buildExtension({ outDir, targets: ['firefox'] });
  source = await readFile(join(outDir, 'firefox/page-hook.js'), 'utf8');
});

after(() => rm(outDir, { recursive: true, force: true }));

const toBuffer = (bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

const loadHook = () => {
  const posted = [];
  const sent = [];
  class FakeSocket {
    listeners = [];

    send(data) { sent.push(data); }

    addEventListener(type, listener) { this.listeners.push(listener); }

    receive(bytes) { this.listeners.forEach((listener) => listener({ data: toBuffer(bytes) })); }
  }
  const context = {
    WebSocket: FakeSocket,
    window: { location: { origin: 'https://baiakidle.com' }, postMessage: (data, origin) => posted.push({ data, origin }) },
    ArrayBuffer,
    Uint8Array,
    TextDecoder,
    WeakSet,
    Date,
    JSON,
    Object,
    Array,
    Number,
    String,
    Error,
    Math,
    DataView,
    BigInt,
  };
  vm.runInNewContext(source, context);
  return { FakeSocket, posted, sent };
};

test('o hook instala o WebSocket.prototype.send e continua enviando ao servidor', () => {
  const { FakeSocket, sent } = loadHook();
  const socket = new FakeSocket();
  const payload = toBuffer(roomData('cpong'));
  socket.send(payload);
  assert.deepEqual(sent, [payload]);
});

test('mensagens recebidas chegam à ponte via postMessage com a tag e a origem da página', () => {
  const { FakeSocket, posted } = loadHook();
  const socket = new FakeSocket();
  socket.send(toBuffer(roomData('cpong')));
  socket.receive(patchFrame(15, JSON.stringify({ 'h:troll-cave': 1, troll: 5 }), JSON.stringify({ 'gold coin': { n: 1, g: 1 } })));
  assert.equal(posted.length, 1);
  assert.equal(posted[0].origin, 'https://baiakidle.com');
  assert.equal(posted[0].data.source, TAG);
  assert.equal(posted[0].data.event.type, 'snapshot');
  assert.equal(posted[0].data.event.bestiary.troll, 5);
});

test('mensagens enviadas pelo cliente reiniciam a janela', () => {
  const { FakeSocket, posted } = loadHook();
  new FakeSocket().send(toBuffer(roomData('stage', { huntId: 'troll-cave' })));
  assert.deepEqual(posted.map((p) => [p.data.event.type, p.data.event.reason, p.data.event.huntId]), [['reset', 'hunt', 'troll-cave']]);
});

test('o socket só recebe um listener mesmo com vários envios', () => {
  const { FakeSocket, posted } = loadHook();
  const socket = new FakeSocket();
  socket.send(toBuffer(roomData('cpong')));
  socket.send(toBuffer(roomData('cpong')));
  socket.receive(patchFrame(15, JSON.stringify({ 'h:troll-cave': 1, troll: 5 })));
  assert.equal(posted.length, 1);
});

test('o hook empacotado leva a tabela de magias e atribui o dano à magia', async () => {
  const { FakeSocket, posted } = loadHook();
  const socket = new FakeSocket();
  socket.send(toBuffer(roomData('cpong')));
  socket.receive(roomData('fx', [{ t: 'cd', slot: 2, words: 'exevo gran mas vis', group: 'attack' }]));
  socket.receive(roomData('combatlog', [{ k: 'dealt', voc: 'sorcerer', foe: { kind: 'mob', name: 'Troll' }, amount: 900, el: 'energy', crit: false }]));
  await new Promise((resolve) => { setTimeout(resolve, 60); });
  socket.receive(roomData('combatlog', [{ k: 'dealt', voc: 'knight', foe: { kind: 'mob', name: 'Troll' }, amount: 5, el: 'physical', crit: false }]));
  const rotation = posted.map((p) => p.data.event).filter((event) => event.type === 'rotation');
  assert.equal(rotation.length, 1);
  assert.equal(rotation[0].stats.members.sorcerer.mobs.spells['exevo gran mas vis'].dealt, 900);
});
