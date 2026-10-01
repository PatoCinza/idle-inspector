import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readMsgpack } from '../src/capture/msgpack.js';
import { parseFrame, parsePatch } from '../src/capture/frames.js';
import { encode, roomData, patchFrame } from './support/msgpack.js';

const roundTrip = (value) => readMsgpack(encode(value), 0).value;

test('msgpack lê tipos e limites de tamanho', () => {
  const samples = [0, 127, 128, 255, 256, 65535, 65536, -1, -32, -33, 1.5, true, false, null, '', 'ação', 'x'.repeat(40), 'y'.repeat(300)];
  samples.forEach((value) => assert.deepEqual(roundTrip(value), value));
});

test('msgpack lê arrays e mapas aninhados', () => {
  const value = { slots: { 7: { tier: 3, monsterKey: 'troll' } }, list: [1, [2, 3], { a: null }] };
  assert.deepEqual(roundTrip(value), value);
});

test('msgpack informa onde a leitura terminou', () => {
  const bytes = encode('charms');
  assert.equal(readMsgpack(bytes, 0).end, bytes.length);
});

test('mensagem ROOM_DATA traz tipo e payload', () => {
  const frame = parseFrame(roomData('charms', { slots: { 1: { tier: 2, monsterKey: 'troll' } } }));
  assert.equal(frame.kind, 'message');
  assert.equal(frame.type, 'charms');
  assert.deepEqual(frame.payload, { slots: { 1: { tier: 2, monsterKey: 'troll' } } });
});

test('mensagem sem payload devolve undefined', () => {
  assert.equal(parseFrame(roomData('charmreset')).payload, undefined);
});

test('patch reconhece o bestiário pela chave h:', () => {
  const bestiary = JSON.stringify({ 'h:troll-cave': 40, troll: 1200, bp: 3 });
  const patch = parseFrame(patchFrame(15, bestiary));
  assert.equal(patch.kind, 'patch');
  assert.equal(patch.bestiary['h:troll-cave'], 40);
  assert.equal(patch.loot, null);
});

test('patch reconhece o loot tracker pela chave "* coin"', () => {
  const loot = JSON.stringify({ 'gold coin': { n: 500, g: 500 }, rope: { n: 2, g: 30 } });
  const patch = parseFrame(patchFrame(14, loot));
  assert.deepEqual(patch.loot['gold coin'], { n: 500, g: 500 });
});

test('patch com bestiário e loot no mesmo frame separa os dois', () => {
  const parsed = parsePatch(patchFrame(15, JSON.stringify({ 'h:troll-cave': 1, troll: 5 }), JSON.stringify({ 'gold coin': { n: 9, g: 9 } })));
  assert.ok(parsed.bestiary);
  assert.ok(parsed.loot);
});

test('patch sem JSON reconhecido não produz dados', () => {
  assert.deepEqual(parsePatch(patchFrame(15, JSON.stringify({ hp: { n: 1 } }))), { bestiary: null, loot: null, codex: null });
});

test('frames de outros tipos são ignorados', () => {
  assert.equal(parseFrame(Uint8Array.of(10, 1, 2)), null);
});

const hexBytes = (hex) => Uint8Array.from(hex.split(' ').map((h) => parseInt(h, 16)));

test('msgpack pula extensões e binários sem perder a posição', () => {
  const fixext = readMsgpack(hexBytes('d4 72 40 91'), 0);
  assert.deepEqual(fixext.value, { ext: 0x72 });
  assert.equal(fixext.end, 3);
  assert.deepEqual(readMsgpack(hexBytes('c7 03 05 01 02 03'), 0), { value: { ext: 5 }, end: 6 });
  assert.deepEqual(readMsgpack(hexBytes('92 d7 ff 00 00 00 00 00 00 00 00 07'), 0).value, [{ ext: -1 }, 7]);
  const binary = readMsgpack(hexBytes('c4 02 aa bb'), 0);
  assert.deepEqual([...binary.value], [0xaa, 0xbb]);
  assert.equal(binary.end, 4);
});

test('cpong real do cliente (payload fixext) é lido sem erro', () => {
  const frame = hexBytes('0d a5 63 70 6f 6e 67 d4 72 40 91 a1 74 cb 42 7a 0f 4b 34 d6 b0 00');
  const parsed = parseFrame(frame);
  assert.equal(parsed.type, 'cpong');
  assert.deepEqual(parsed.payload, { ext: 0x72 });
});
